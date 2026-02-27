"""
PDF Report Generator
====================
Generates a professional PDF audit report using ReportLab.
Falls back to a plain text report if reportlab is not installed.
"""
from __future__ import annotations

import io
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


def _format_currency(v: float) -> str:
    return f"${v:,.2f}"


def generate_pdf_report(
    scan_id: str,
    resources: list[dict[str, Any]],
    violations: list[dict[str, Any]],
    recommendations: list[dict[str, Any]],
    compliance: dict[str, Any],
    risk: dict[str, Any],
) -> bytes:
    """
    Generate a PDF audit report. Returns bytes (PDF or plain text fallback).
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            HRFlowable, KeepTogether,
        )
        return _build_pdf(
            scan_id, resources, violations, recommendations, compliance, risk,
            colors, A4, getSampleStyleSheet, ParagraphStyle, cm,
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            HRFlowable, KeepTogether,
        )
    except ImportError:
        logger.warning("reportlab not installed — generating plain text report")
        return _build_text_report(scan_id, resources, violations, recommendations, compliance, risk)


def _build_pdf(
    scan_id, resources, violations, recommendations, compliance, risk,
    colors, A4, getSampleStyleSheet, ParagraphStyle, cm,
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether,
) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )
    styles = getSampleStyleSheet()
    story = []

    # ── Colors ────────────────────────────────────────────────────────
    NAVY  = colors.HexColor("#1e3a5f")
    BLUE  = colors.HexColor("#2563eb")
    RED   = colors.HexColor("#dc2626")
    ORG   = colors.HexColor("#ea580c")
    YEL   = colors.HexColor("#ca8a04")
    GRN   = colors.HexColor("#16a34a")
    LGRAY = colors.HexColor("#f1f5f9")
    GRAY  = colors.HexColor("#64748b")

    SEVERITY_COLORS = {"CRITICAL": RED, "HIGH": ORG, "MEDIUM": YEL, "LOW": GRN}

    def h1(text):
        return Paragraph(f"<font color='#{NAVY.hexval()[2:]}' size='18'><b>{text}</b></font>", styles["Heading1"])

    def h2(text):
        return Paragraph(f"<font color='#{NAVY.hexval()[2:]}' size='13'><b>{text}</b></font>", styles["Heading2"])

    def body(text):
        return Paragraph(text, styles["BodyText"])

    def label(text, color=None):
        c = f"#{color.hexval()[2:]}" if color else "#1e3a5f"
        return Paragraph(f"<font color='{c}'><b>{text}</b></font>", styles["BodyText"])

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    total_waste = sum(r.get("estimated_monthly_savings", 0) for r in recommendations)
    overall_score = compliance.get("overall_score", 0)
    risk_score = risk.get("overall_risk_score", 0)
    risk_level = risk.get("risk_level", "UNKNOWN")

    # ── Cover ─────────────────────────────────────────────────────────
    story.append(Spacer(1, 1*cm))
    story.append(label("CLOUD RESOURCE AUDIT REPORT", NAVY))
    story.append(Spacer(1, 0.3*cm))
    story.append(h1("Executive Summary"))
    story.append(HRFlowable(width="100%", thickness=2, color=BLUE))
    story.append(Spacer(1, 0.3*cm))

    meta = [
        ["Scan ID", scan_id],
        ["Generated", now_str],
        ["Total Resources", str(len(resources))],
        ["Total Violations", str(len(violations))],
        ["Critical Violations", str(compliance.get("critical_violations", 0))],
        ["Estimated Monthly Waste", _format_currency(total_waste)],
        ["Overall Compliance Score", f"{overall_score}%"],
        ["Risk Score", f"{risk_score}/100  [{risk_level}]"],
    ]
    t = Table(meta, colWidths=[6*cm, 10*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), LGRAY),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, LGRAY]),
        ("GRID", (0, 0), (-1, -1), 0.5, GRAY),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.8*cm))

    # ── Compliance Framework Scores ───────────────────────────────────
    story.append(h2("Compliance Framework Scores"))
    fw_data = [["Framework", "Pass", "Fail", "Score"]]
    for fw, data in compliance.get("frameworks", {}).items():
        fw_data.append([fw, str(data["pass"]), str(data["fail"]), f"{data['score']}%"])
    ft = Table(fw_data, colWidths=[5*cm, 3*cm, 3*cm, 4*cm])
    ft.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LGRAY]),
        ("GRID", (0, 0), (-1, -1), 0.5, GRAY),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(ft)
    story.append(Spacer(1, 0.8*cm))

    # ── Top Violations ────────────────────────────────────────────────
    story.append(h2("Top Violations by Severity"))
    sev_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    top_viols = sorted(violations, key=lambda v: sev_order.get(v.get("severity", "LOW"), 3))[:15]
    viol_data = [["Severity", "Rule", "Resource", "Message"]]
    for v in top_viols:
        msg = v.get("message", "")[:70] + ("..." if len(v.get("message", "")) > 70 else "")
        rid = v.get("resource_id", "")[-30:]
        viol_data.append([v.get("severity", ""), v.get("rule_id", ""), rid, msg])
    vt = Table(viol_data, colWidths=[2.5*cm, 2.5*cm, 4.5*cm, 6.5*cm])
    vt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LGRAY]),
        ("GRID", (0, 0), (-1, -1), 0.3, GRAY),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("WORDWRAP", (3, 1), (3, -1), True),
    ]))
    story.append(vt)
    story.append(Spacer(1, 0.8*cm))

    # ── Top Savings Opportunities ─────────────────────────────────────
    story.append(h2("Top Savings Opportunities"))
    top_recs = sorted(recommendations, key=lambda r: r.get("estimated_monthly_savings", 0), reverse=True)[:10]
    rec_data = [["Category", "Title", "Resource", "Monthly Savings"]]
    for r in top_recs:
        rec_data.append([
            r.get("category", ""),
            (r.get("title", ""))[:40],
            r.get("resource_id", "")[-25:],
            _format_currency(r.get("estimated_monthly_savings", 0)),
        ])
    rt = Table(rec_data, colWidths=[3*cm, 6*cm, 4*cm, 3*cm])
    rt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LGRAY]),
        ("GRID", (0, 0), (-1, -1), 0.3, GRAY),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(rt)
    story.append(Spacer(1, 0.5*cm))
    story.append(body(f"<b>Total estimated monthly savings if all recommendations actioned: {_format_currency(total_waste)}</b>"))

    doc.build(story)
    return buf.getvalue()


def _build_text_report(
    scan_id, resources, violations, recommendations, compliance, risk
) -> bytes:
    """Plain text fallback when reportlab is not installed."""
    lines = [
        "=" * 70,
        "CLOUD RESOURCE AUDIT REPORT",
        "=" * 70,
        f"Scan ID:    {scan_id}",
        f"Generated:  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        f"Resources:  {len(resources)}",
        f"Violations: {len(violations)}",
        f"Risk Score: {risk.get('overall_risk_score', 0)}/100 [{risk.get('risk_level', '')}]",
        f"Compliance: {compliance.get('overall_score', 0)}%",
        "",
        "COMPLIANCE SCORES",
        "-" * 40,
    ]
    for fw, data in compliance.get("frameworks", {}).items():
        lines.append(f"  {fw:<20} {data['score']}%  (pass={data['pass']} fail={data['fail']})")

    total_waste = sum(r.get("estimated_monthly_savings", 0) for r in recommendations)
    lines += [
        "",
        "TOP SAVINGS",
        "-" * 40,
    ]
    top_recs = sorted(recommendations, key=lambda r: r.get("estimated_monthly_savings", 0), reverse=True)[:10]
    for r in top_recs:
        lines.append(f"  ${r.get('estimated_monthly_savings', 0):>8.2f}/mo  {r.get('title', '')}")
    lines.append(f"\n  TOTAL ESTIMATED SAVINGS: ${total_waste:,.2f}/month")
    lines.append("=" * 70)
    return "\n".join(lines).encode("utf-8")
