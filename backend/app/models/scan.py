"""
SQLAlchemy models for scan data.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON, DateTime, Float, ForeignKey, Integer, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ScanSession(Base):
    __tablename__ = "scan_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    regions: Mapped[str] = mapped_column(Text, default="")          # comma-separated
    resource_types: Mapped[str] = mapped_column(Text, default="")   # comma-separated
    started_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resource_count: Mapped[int] = mapped_column(Integer, default=0)
    violation_count: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    resources: Mapped[list["Resource"]] = relationship(back_populates="scan", cascade="all, delete-orphan")
    violations: Mapped[list["Violation"]] = relationship(back_populates="scan", cascade="all, delete-orphan")
    cost_records: Mapped[list["CostRecord"]] = relationship(back_populates="scan", cascade="all, delete-orphan")
    recommendations: Mapped[list["Recommendation"]] = relationship(back_populates="scan", cascade="all, delete-orphan")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "status": self.status,
            "regions": [r for r in self.regions.split(",") if r],
            "resource_types": [r for r in self.resource_types.split(",") if r],
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "resource_count": self.resource_count,
            "violation_count": self.violation_count,
            "error": self.error,
        }


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    scan_id: Mapped[str] = mapped_column(String(36), ForeignKey("scan_sessions.id"), index=True)
    resource_id: Mapped[str] = mapped_column(String(200), index=True)
    resource_type: Mapped[str] = mapped_column(String(50), index=True)
    region: Mapped[str] = mapped_column(String(50))
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    state: Mapped[str | None] = mapped_column(String(50), nullable=True)
    risk_score: Mapped[int] = mapped_column(Integer, default=0)
    violation_count: Mapped[int] = mapped_column(Integer, default=0)
    tags: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    raw_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    scan: Mapped["ScanSession"] = relationship(back_populates="resources")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "scan_id": self.scan_id,
            "resource_id": self.resource_id,
            "resource_type": self.resource_type,
            "region": self.region,
            "name": self.name,
            "state": self.state,
            "risk_score": self.risk_score,
            "violation_count": self.violation_count,
            "tags": self.tags or {},
            "raw_data": self.raw_data or {},
        }


class Violation(Base):
    __tablename__ = "violations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    scan_id: Mapped[str] = mapped_column(String(36), ForeignKey("scan_sessions.id"), index=True)
    resource_id: Mapped[str] = mapped_column(String(200), index=True)
    resource_type: Mapped[str] = mapped_column(String(50), index=True)
    region: Mapped[str] = mapped_column(String(50))
    rule_id: Mapped[str] = mapped_column(String(50), index=True)
    severity: Mapped[str] = mapped_column(String(20), index=True)
    message: Mapped[str] = mapped_column(Text)
    remediation: Mapped[str | None] = mapped_column(Text, nullable=True)

    scan: Mapped["ScanSession"] = relationship(back_populates="violations")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "scan_id": self.scan_id,
            "resource_id": self.resource_id,
            "resource_type": self.resource_type,
            "region": self.region,
            "rule_id": self.rule_id,
            "severity": self.severity,
            "message": self.message,
            "remediation": self.remediation or "",
        }


class CostRecord(Base):
    __tablename__ = "cost_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scan_id: Mapped[str] = mapped_column(String(36), ForeignKey("scan_sessions.id"), index=True)
    data: Mapped[list | None] = mapped_column(JSON, nullable=True)  # full cost data array

    scan: Mapped["ScanSession"] = relationship(back_populates="cost_records")


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    scan_id: Mapped[str] = mapped_column(String(36), ForeignKey("scan_sessions.id"), index=True)
    category: Mapped[str] = mapped_column(String(50), index=True)
    rule_id: Mapped[str] = mapped_column(String(50))
    resource_id: Mapped[str] = mapped_column(String(200))
    resource_type: Mapped[str] = mapped_column(String(50))
    region: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text)
    estimated_monthly_savings: Mapped[float] = mapped_column(Float, default=0.0)
    confidence: Mapped[str] = mapped_column(String(20))
    severity: Mapped[str] = mapped_column(String(20))

    scan: Mapped["ScanSession"] = relationship(back_populates="recommendations")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "scan_id": self.scan_id,
            "category": self.category,
            "rule_id": self.rule_id,
            "resource_id": self.resource_id,
            "resource_type": self.resource_type,
            "region": self.region,
            "title": self.title,
            "description": self.description,
            "action": self.action,
            "estimated_monthly_savings": self.estimated_monthly_savings,
            "confidence": self.confidence,
            "severity": self.severity,
        }
