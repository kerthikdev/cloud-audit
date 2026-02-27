from __future__ import annotations

import logging
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core import store
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.scan import (
    CostRecord, Recommendation, Resource, ScanSession, Violation,
)
from app.services.alerting import send_critical_alerts
from app.services.cost_engine.cost_explorer import get_cost_data
from app.services.governance.encryption_checks import check_encryption
from app.services.governance.security_group_checks import check_security_groups
from app.services.governance.tag_validation import validate_tags
from app.services.rules_engine.ec2_rules import evaluate_ec2_rules
from app.services.rules_engine.lb_rules import evaluate_lb_rules
from app.services.rules_engine.nat_rules import evaluate_nat_rules
from app.services.rules_engine.rds_rules import evaluate_rds_rules
from app.services.rules_engine.scoring import compute_risk_score
from app.services.rules_engine.storage_rules import evaluate_storage_rules
from app.services.rules_engine.lambda_rules import evaluate_lambda_rules
from app.services.rules_engine.iam_rules import evaluate_iam_rules
from app.services.rules_engine.cloudfront_rules import evaluate_cloudfront_rules, evaluate_cloudwatch_rules
from app.services.scanner.ebs_scanner import scan_ebs
from app.services.scanner.ec2_scanner import scan_ec2
from app.services.scanner.eip_scanner import scan_eip
from app.services.scanner.lb_scanner import scan_lb
from app.services.scanner.nat_scanner import scan_nat
from app.services.scanner.rds_scanner import scan_rds
from app.services.scanner.s3_scanner import scan_s3
from app.services.scanner.snapshot_scanner import scan_snapshots
from app.services.scanner.lambda_scanner import scan_lambda
from app.services.scanner.iam_scanner import scan_iam
from app.services.scanner.cloudfront_scanner import scan_cloudfront
from app.services.scanner.cloudwatch_scanner import scan_cloudwatch
from app.services.recommendations import generate_recommendations
from app.services.compliance_scorer import score_compliance
from app.services.risk_engine import compute_scan_risk_score

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/scans", tags=["audit"])

SCANNERS = {
    "EC2":        scan_ec2,
    "EBS":        scan_ebs,
    "S3":         scan_s3,
    "RDS":        scan_rds,
    "EIP":        scan_eip,
    "SNAPSHOT":   scan_snapshots,
    "LB":         scan_lb,
    "NAT":        scan_nat,
    "Lambda":     scan_lambda,
    "IAM":        scan_iam,
    "CloudFront": scan_cloudfront,
    "CloudWatch": scan_cloudwatch,
}

# IAM and CloudFront are global — only scan once per run, not per region
_GLOBAL_SCANNERS = {"IAM", "CloudFront"}


class ScanRequest(BaseModel):
    regions: list[str] = ["us-east-1"]
    resource_types: Optional[list[str]] = None


# ── Per-region scanner (runs inside a thread) ─────────────────────────────────

def _scan_region_type(region: str, rtype: str, scanner_fn) -> tuple[list, list]:
    """Scan one resource type in one region. Returns (resources, violations)."""
    resources_out = []
    violations_out = []
    try:
        logger.info(f"[Parallel] Scanning {rtype} in {region}")
        raw_resources = scanner_fn(region)

        for r in raw_resources:
            r["region"] = r.get("region", region)

            # Rules engine — dispatch by resource type
            if rtype == "EC2":
                violations = evaluate_ec2_rules(r)
            elif rtype == "RDS":
                violations = evaluate_rds_rules(r)
            elif rtype == "LB":
                violations = evaluate_lb_rules(r)
            elif rtype == "NAT":
                violations = evaluate_nat_rules(r)
            elif rtype == "Lambda":
                violations = evaluate_lambda_rules(r)
            elif rtype == "IAM":
                violations = evaluate_iam_rules(r)
            elif rtype == "CloudFront":
                violations = evaluate_cloudfront_rules(r)
            elif rtype == "CloudWatch":
                violations = evaluate_cloudwatch_rules(r)
            else:
                violations = evaluate_storage_rules(r)

            # Governance checks (only for regional cloud resources)
            if rtype not in {"IAM", "CloudFront"}:
                violations += validate_tags(r)
            if rtype == "EC2":
                violations += check_security_groups(r)
            if rtype == "RDS":
                violations += check_encryption(r)

            risk_score = compute_risk_score(violations)
            r["risk_score"] = risk_score
            r["violation_count"] = len(violations)
            resources_out.append(r)

            for v in violations:
                violations_out.append({
                    "id": str(uuid.uuid4()),
                    "resource_id": r["resource_id"],
                    "resource_type": rtype,
                    "region": region,
                    "rule_id": v.get("rule_id", "UNKNOWN"),
                    "severity": v.get("severity", "MEDIUM"),
                    "message": v.get("message", ""),
                    "remediation": v.get("recommendation", ""),
                })
    except Exception as e:
        logger.error(f"[Parallel] Scanner {rtype} failed in {region}: {e}")
    return resources_out, violations_out


# ── DB persistence helper ─────────────────────────────────────────────────────

def _persist_scan_to_db(
    scan_id: str,
    session_data: dict,
    all_resources: list,
    all_violations: list,
    cost_data: list,
    recs: list,
) -> None:
    """Write completed scan data to SQLite."""
    try:
        from app.core.database import SessionLocal
        db = SessionLocal()
        try:
            # Upsert ScanSession
            db_session = db.query(ScanSession).filter(ScanSession.id == scan_id).first()
            if not db_session:
                db_session = ScanSession(id=scan_id)
                db.add(db_session)

            db_session.status = session_data["status"]
            db_session.regions = ",".join(session_data.get("regions", []))
            db_session.resource_types = ",".join(session_data.get("resource_types", []))
            db_session.started_at = datetime.fromisoformat(session_data["started_at"])
            if session_data.get("completed_at"):
                db_session.completed_at = datetime.fromisoformat(session_data["completed_at"])
            db_session.resource_count = session_data.get("resource_count", 0)
            db_session.violation_count = session_data.get("violation_count", 0)
            db_session.error = session_data.get("error")
            db.flush()

            # Resources
            for r in all_resources:
                db_r = Resource(
                    id=r.get("id", str(uuid.uuid4())),
                    scan_id=scan_id,
                    resource_id=r["resource_id"],
                    resource_type=r["resource_type"],
                    region=r["region"],
                    name=r.get("name"),
                    state=r.get("state"),
                    risk_score=r.get("risk_score", 0),
                    violation_count=r.get("violation_count", 0),
                    tags=r.get("tags", {}),
                    raw_data=r.get("raw_data", {}),
                )
                db.add(db_r)

            # Violations
            for v in all_violations:
                db_v = Violation(
                    id=v.get("id", str(uuid.uuid4())),
                    scan_id=scan_id,
                    resource_id=v["resource_id"],
                    resource_type=v["resource_type"],
                    region=v["region"],
                    rule_id=v["rule_id"],
                    severity=v["severity"],
                    message=v["message"],
                    remediation=v.get("remediation", ""),
                )
                db.add(db_v)

            # Cost records (store as single JSON blob)
            if cost_data:
                db.add(CostRecord(scan_id=scan_id, data=cost_data))

            # Recommendations
            for rec in recs:
                db_rec = Recommendation(
                    id=rec.get("id", str(uuid.uuid4())),
                    scan_id=scan_id,
                    category=rec.get("category", ""),
                    rule_id=rec.get("rule_id", ""),
                    resource_id=rec.get("resource_id", ""),
                    resource_type=rec.get("resource_type", ""),
                    region=rec.get("region", ""),
                    title=rec.get("title", ""),
                    description=rec.get("description", ""),
                    action=rec.get("action", ""),
                    estimated_monthly_savings=rec.get("estimated_monthly_savings", 0.0),
                    confidence=rec.get("confidence", "LOW"),
                    severity=rec.get("severity", "LOW"),
                )
                db.add(db_rec)

            db.commit()
            logger.info(f"Scan {scan_id} persisted to DB")
        except Exception as e:
            db.rollback()
            logger.error(f"DB persist failed for scan {scan_id}: {e}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Could not open DB session: {e}")


# ── Background scan task ──────────────────────────────────────────────────────

def _run_scan(scan_id: str, regions: list[str], resource_types: list[str]) -> None:
    """Background task: scan AWS in parallel and persist results."""
    try:
        store.scan_sessions[scan_id]["status"] = "running"
        all_resources: list[dict[str, Any]] = []
        all_violations: list[dict[str, Any]] = []

        # Build list of (region, rtype, scanner_fn) tasks
        # Global scanners (IAM, CloudFront) run once for the first region only
        seen_global: set[str] = set()
        tasks = []
        for region in regions:
            for rtype, scanner_fn in SCANNERS.items():
                if rtype not in resource_types:
                    continue
                if rtype in _GLOBAL_SCANNERS:
                    if rtype in seen_global:
                        continue
                    seen_global.add(rtype)
                tasks.append((region, rtype, scanner_fn))

        # Run all region×resource-type combinations in parallel
        with ThreadPoolExecutor(max_workers=min(len(tasks), 16)) as pool:
            futures = {
                pool.submit(_scan_region_type, region, rtype, fn): (region, rtype)
                for region, rtype, fn in tasks
            }
            for future in as_completed(futures):
                region, rtype = futures[future]
                try:
                    resources, violations = future.result()
                    for r in resources:
                        r["scan_id"] = scan_id
                        r["id"] = str(uuid.uuid4())
                    for v in violations:
                        v["scan_id"] = scan_id
                    all_resources.extend(resources)
                    all_violations.extend(violations)
                    logger.info(f"[Parallel] Done {rtype}/{region}: {len(resources)} resources, {len(violations)} violations")
                except Exception as e:
                    logger.error(f"[Parallel] Future failed for {rtype}/{region}: {e}")

        # Cost data
        cost_data = []
        try:
            cost_data = get_cost_data(regions)
            store.scan_costs[scan_id] = cost_data
        except Exception as e:
            logger.warning(f"Cost data failed: {e}")
            store.scan_costs[scan_id] = []

        # Recommendations
        recs = []
        try:
            recs = generate_recommendations(scan_id, all_violations, all_resources)
            store.scan_recommendations[scan_id] = recs
        except Exception as e:
            logger.warning(f"Recommendations failed: {e}")
            store.scan_recommendations[scan_id] = []

        # Compliance scoring
        try:
            compliance = score_compliance(all_violations)
            store.scan_compliance[scan_id] = compliance
        except Exception as e:
            logger.warning(f"Compliance scoring failed: {e}")
            store.scan_compliance[scan_id] = {}

        # Risk scoring
        try:
            risk = compute_scan_risk_score(all_resources, all_violations)
            store.scan_risk[scan_id] = risk
        except Exception as e:
            logger.warning(f"Risk scoring failed: {e}")
            store.scan_risk[scan_id] = {}

        store.scan_resources[scan_id] = all_resources
        store.scan_violations[scan_id] = all_violations

        total_waste = sum(r.get("estimated_monthly_savings", 0) for r in recs)
        completed_at = datetime.utcnow().isoformat()
        store.scan_sessions[scan_id].update({
            "status": "completed",
            "completed_at": completed_at,
            "resource_count": len(all_resources),
            "violation_count": len(all_violations),
            "total_monthly_waste": round(total_waste, 2),
            "overall_risk_score": store.scan_risk[scan_id].get("overall_risk_score", 0),
            "risk_level": store.scan_risk[scan_id].get("risk_level", "UNKNOWN"),
            "compliance_score": store.scan_compliance[scan_id].get("overall_score", 0),
        })
        store.save()

        # Persist to SQLite
        _persist_scan_to_db(
            scan_id, store.scan_sessions[scan_id],
            all_resources, all_violations, cost_data, recs,
        )

        # Slack alerts (critical violations + budget threshold)
        send_critical_alerts(scan_id, all_violations)
        _check_budget_threshold(scan_id, total_waste)

        logger.info(
            f"Scan {scan_id} done: {len(all_resources)} resources, "
            f"{len(all_violations)} violations, risk={store.scan_risk[scan_id].get('risk_level')}, "
            f"compliance={store.scan_compliance[scan_id].get('overall_score')}% [parallel]"
        )

    except Exception as e:
        store.scan_sessions[scan_id]["status"] = "failed"
        store.scan_sessions[scan_id]["error"] = str(e)
        logger.error(f"Scan {scan_id} failed: {e}")


# ── API Routes ────────────────────────────────────────────────────────────────

@router.post("", status_code=202)
async def trigger_scan(
    payload: ScanRequest,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
):
    scan_id = str(uuid.uuid4())
    rtypes = payload.resource_types or list(SCANNERS.keys())
    store.scan_sessions[scan_id] = {
        "id": scan_id,
        "status": "pending",
        "regions": payload.regions,
        "resource_types": rtypes,
        "started_at": datetime.utcnow().isoformat(),
        "completed_at": None,
        "resource_count": 0,
        "violation_count": 0,
        "triggered_by": f"user:{current_user.username}",
    }
    background_tasks.add_task(_run_scan, scan_id, payload.regions, rtypes)
    return {"scan_id": scan_id, "status": "pending", "message": "Scan started"}


@router.get("")
async def list_scans(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Merge in-memory (pending/running) with DB (completed/historical)
    from app.models.scan import ScanSession as DBSession
    db_scans = db.query(DBSession).order_by(DBSession.started_at.desc()).all()
    db_ids = {s.id for s in db_scans}

    # In-memory scans not yet in DB (still running/pending)
    live_scans = [
        s for s in store.scan_sessions.values() if s["id"] not in db_ids
    ]
    all_sessions = [s.to_dict() for s in db_scans] + live_scans
    all_sessions.sort(key=lambda s: s.get("started_at", ""), reverse=True)

    return {"scans": all_sessions, "total": len(all_sessions)}


@router.get("/{scan_id}")
async def get_scan(scan_id: str, current_user=Depends(get_current_user)):
    # Check live store first
    if scan_id in store.scan_sessions:
        return store.scan_sessions[scan_id]
    # Fall back to DB
    from app.core.database import SessionLocal
    from app.models.scan import ScanSession as DBSession
    db = SessionLocal()
    try:
        db_session = db.query(DBSession).filter(DBSession.id == scan_id).first()
        if db_session:
            return db_session.to_dict()
    finally:
        db.close()
    raise HTTPException(status_code=404, detail="Scan not found")


@router.get("/{scan_id}/resources")
async def get_scan_resources(
    scan_id: str,
    page: int = 1,
    page_size: int = 500,
    resource_type: Optional[str] = None,
    region: Optional[str] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Try in-memory cache first (for fresh/running scans)
    if scan_id in store.scan_resources and store.scan_resources[scan_id]:
        resources = store.scan_resources[scan_id]
    else:
        # Load from DB
        from app.models.scan import Resource as DBResource
        query = db.query(DBResource).filter(DBResource.scan_id == scan_id)
        resources = [r.to_dict() for r in query.all()]

    if not resources and scan_id not in store.scan_sessions:
        # Check DB for session
        from app.models.scan import ScanSession as DBSession
        if not db.query(DBSession).filter(DBSession.id == scan_id).first():
            raise HTTPException(status_code=404, detail="Scan not found")

    if resource_type:
        resources = [r for r in resources if r.get("resource_type") == resource_type]
    if region:
        resources = [r for r in resources if r.get("region") == region]

    total = len(resources)
    start = (page - 1) * page_size
    return {
        "scan_id": scan_id,
        "resources": resources[start: start + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/{scan_id}/violations")
async def get_scan_violations(
    scan_id: str,
    severity: Optional[str] = None,
    resource_type: Optional[str] = None,
    page: int = 1,
    page_size: int = 500,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if scan_id in store.scan_violations and store.scan_violations[scan_id]:
        violations = store.scan_violations[scan_id]
    else:
        from app.models.scan import Violation as DBViolation
        violations = [v.to_dict() for v in db.query(DBViolation).filter(DBViolation.scan_id == scan_id).all()]

    if severity:
        violations = [v for v in violations if (v.get("severity") or "").upper() == severity.upper()]
    if resource_type:
        violations = [v for v in violations if v.get("resource_type") == resource_type]

    _order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    violations = sorted(violations, key=lambda v: _order.get((v.get("severity") or "LOW").upper(), 4))

    sev_counts: dict[str, int] = {}
    for v in violations:
        s = (v.get("severity") or "UNKNOWN").upper()
        sev_counts[s] = sev_counts.get(s, 0) + 1

    total = len(violations)
    start = (page - 1) * page_size
    return {
        "scan_id": scan_id,
        "violations": violations[start: start + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
        "severity_summary": sev_counts,
    }


@router.get("/{scan_id}/costs")
async def get_scan_costs(
    scan_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.cost_engine.cost_explorer import build_cost_summary

    if scan_id in store.scan_costs:
        cost_records = store.scan_costs[scan_id]
    else:
        from app.models.scan import CostRecord as DBCostRecord
        cr = db.query(DBCostRecord).filter(DBCostRecord.scan_id == scan_id).first()
        cost_records = cr.data if cr else []

    violations = store.scan_violations.get(scan_id, [])
    summary = build_cost_summary(cost_records, violations=violations) if cost_records else {}
    return {"scan_id": scan_id, "records": cost_records, "summary": summary}


@router.get("/{scan_id}/recommendations")
async def get_scan_recommendations(
    scan_id: str,
    category: Optional[str] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if scan_id in store.scan_recommendations and store.scan_recommendations[scan_id]:
        recs = store.scan_recommendations[scan_id]
    else:
        from app.models.scan import Recommendation as DBRec
        recs = [r.to_dict() for r in db.query(DBRec).filter(DBRec.scan_id == scan_id).all()]

    if category:
        recs = [r for r in recs if r.get("category", "").lower() == category.lower()]

    total_savings = round(sum(r.get("estimated_monthly_savings", 0) for r in recs), 2)
    return {
        "scan_id": scan_id,
        "total": len(recs),
        "total_estimated_monthly_savings": total_savings,
        "recommendations": recs,
    }


# ── Export Endpoints ──────────────────────────────────────────────────────────
from fastapi.responses import StreamingResponse


@router.get("/{scan_id}/export/violations.csv")
async def export_violations_csv(scan_id: str, current_user=Depends(get_current_user)):
    from app.services.export_engine import violations_to_csv
    violations = store.scan_violations.get(scan_id, [])
    csv_content = violations_to_csv(violations)
    return StreamingResponse(
        iter([csv_content]), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=violations-{scan_id[:8]}.csv"},
    )


@router.get("/{scan_id}/export/recommendations.csv")
async def export_recommendations_csv(scan_id: str, current_user=Depends(get_current_user)):
    from app.services.export_engine import recommendations_to_csv
    recs = store.scan_recommendations.get(scan_id, [])
    csv_content = recommendations_to_csv(recs)
    return StreamingResponse(
        iter([csv_content]), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=recommendations-{scan_id[:8]}.csv"},
    )


@router.get("/{scan_id}/export/report.json")
async def export_full_json(scan_id: str, current_user=Depends(get_current_user)):
    from app.services.export_engine import build_json_bundle
    from app.services.cost_engine.cost_explorer import build_cost_summary
    session = store.scan_sessions.get(scan_id, {})
    resources = store.scan_resources.get(scan_id, [])
    violations = store.scan_violations.get(scan_id, [])
    cost_records = store.scan_costs.get(scan_id, [])
    recs = store.scan_recommendations.get(scan_id, [])
    cost_summary = build_cost_summary(cost_records, violations) if cost_records else {}
    json_content = build_json_bundle(session, resources, violations, cost_summary, recs)
    return StreamingResponse(
        iter([json_content]), media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=scan-{scan_id[:8]}.json"},
    )


@router.get("/{scan_id}/export/report.html")
async def export_html_report(scan_id: str, current_user=Depends(get_current_user)):
    from app.services.export_engine import build_html_report
    from app.services.cost_engine.cost_explorer import build_cost_summary
    session = store.scan_sessions.get(scan_id, {})
    violations = store.scan_violations.get(scan_id, [])
    cost_records = store.scan_costs.get(scan_id, [])
    recs = store.scan_recommendations.get(scan_id, [])
    cost_summary = build_cost_summary(cost_records, violations) if cost_records else {}
    html_content = build_html_report(session, violations, cost_summary, recs)
    return StreamingResponse(
        iter([html_content]), media_type="text/html",
        headers={"Content-Disposition": f"inline; filename=report-{scan_id[:8]}.html"},
    )


@router.get("/{scan_id}/compliance")
async def get_scan_compliance(scan_id: str, current_user=Depends(get_current_user)):
    """Return compliance framework scores for a specific scan."""
    # Try live store first
    if scan_id in store.scan_compliance:
        return {"scan_id": scan_id, **store.scan_compliance[scan_id]}

    # Recompute from stored violations
    violations = store.scan_violations.get(scan_id, [])
    if not violations:
        from app.core.database import SessionLocal
        from app.models.scan import Violation as DBViolation
        db = SessionLocal()
        try:
            violations = [v.to_dict() for v in db.query(DBViolation).filter(DBViolation.scan_id == scan_id).all()]
        finally:
            db.close()

    if not violations and scan_id not in store.scan_sessions:
        raise HTTPException(status_code=404, detail="Scan not found")

    compliance = score_compliance(violations)
    store.scan_compliance[scan_id] = compliance
    return {"scan_id": scan_id, **compliance}


@router.get("/{scan_id}/risk")
async def get_scan_risk(scan_id: str, current_user=Depends(get_current_user)):
    """Return risk score summary for a specific scan."""
    if scan_id in store.scan_risk:
        return {"scan_id": scan_id, **store.scan_risk[scan_id]}

    resources = store.scan_resources.get(scan_id, [])
    violations = store.scan_violations.get(scan_id, [])

    if not resources and scan_id not in store.scan_sessions:
        raise HTTPException(status_code=404, detail="Scan not found")

    risk = compute_scan_risk_score(resources, violations)
    store.scan_risk[scan_id] = risk
    return {"scan_id": scan_id, **risk}


@router.get("/{scan_id}/export/report.pdf")
async def export_pdf_report(scan_id: str, current_user=Depends(get_current_user)):
    """Generate and return a professional PDF audit report."""
    from app.services.pdf_report import generate_pdf_report

    resources = store.scan_resources.get(scan_id, [])
    violations = store.scan_violations.get(scan_id, [])
    recs = store.scan_recommendations.get(scan_id, [])
    compliance = store.scan_compliance.get(scan_id, {})
    risk = store.scan_risk.get(scan_id, {})

    if not resources and scan_id not in store.scan_sessions:
        raise HTTPException(status_code=404, detail="Scan not found")

    # Compute on-the-fly if not already stored
    if not compliance and violations:
        compliance = score_compliance(violations)
    if not risk and resources:
        risk = compute_scan_risk_score(resources, violations)

    pdf_bytes = generate_pdf_report(scan_id, resources, violations, recs, compliance, risk)

    # Determine content type (PDF or text fallback)
    media_type = "application/pdf" if pdf_bytes[:4] == b"%PDF" else "text/plain"
    ext = "pdf" if media_type == "application/pdf" else "txt"

    return StreamingResponse(
        iter([pdf_bytes]), media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename=audit-report-{scan_id[:8]}.{ext}"},
    )


# ── Budget threshold alert ─────────────────────────────────────────────────────

def _check_budget_threshold(scan_id: str, total_waste: float) -> None:
    """Send a Slack/webhook alert if monthly waste exceeds configured budget threshold."""
    try:
        from app.core.config import get_settings
        from app.services.alerting import send_slack_message
        cfg = get_settings()
        threshold = getattr(cfg, "budget_threshold_usd", None)
        if threshold and total_waste >= float(threshold):
            msg = (
                f":moneybag: *Budget Alert* — Scan `{scan_id[:8]}` detected "
                f"*${total_waste:,.2f}/month* in cloud waste, "
                f"exceeding your threshold of *${float(threshold):,.2f}/month*.\n"
                f"Review recommendations in the audit dashboard immediately."
            )
            send_slack_message(msg)
    except Exception as e:
        logger.debug(f"Budget threshold check skipped: {e}")

