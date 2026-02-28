/**
 * usePagination — hook for paginating any array of items.
 * Returns: { page, setPage, pageSize, setPageSize, paged, totalPages, from, to, total }
 */
import { useState, useMemo } from 'react'

export function usePagination(items, defaultPageSize = 50) {
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(defaultPageSize)

    const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
    const safePage = Math.min(page, totalPages)

    // Reset to page 1 whenever items change (e.g. after filter)
    // We do this via useMemo to avoid extra renders
    const paged = useMemo(() => {
        const start = (safePage - 1) * pageSize
        return items.slice(start, start + pageSize)
    }, [items, safePage, pageSize])

    const from = items.length === 0 ? 0 : (safePage - 1) * pageSize + 1
    const to = Math.min(safePage * pageSize, items.length)

    return {
        page: safePage,
        setPage,
        pageSize,
        setPageSize,
        paged,
        totalPages,
        from,
        to,
        total: items.length,
    }
}

/**
 * PaginationBar — renders Prev / page info / Next controls.
 * Props: { page, setPage, totalPages, from, to, total, pageSize, setPageSize }
 */
export function PaginationBar({ page, setPage, totalPages, from, to, total, pageSize, setPageSize }) {
    if (total === 0) return null

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 10,
            marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)',
            fontSize: 12, color: 'var(--text-secondary)',
        }}>
            <span>
                Showing <strong style={{ color: 'var(--text)' }}>{from}–{to}</strong> of{' '}
                <strong style={{ color: 'var(--text)' }}>{total}</strong> resources
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Page size selector */}
                <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                    style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--border)', borderRadius: 6,
                        color: 'var(--text)', fontSize: 12, padding: '3px 8px',
                        cursor: 'pointer', outline: 'none',
                    }}
                >
                    {[25, 50, 100, 200].map(n => (
                        <option key={n} value={n} style={{ background: '#1e293b' }}>{n} per page</option>
                    ))}
                </select>

                {/* Prev */}
                <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    style={{
                        padding: '4px 12px', borderRadius: 6, fontSize: 12,
                        background: page <= 1 ? 'transparent' : 'rgba(255,255,255,0.06)',
                        border: '1px solid var(--border)',
                        color: page <= 1 ? 'var(--text-secondary)' : 'var(--text)',
                        cursor: page <= 1 ? 'not-allowed' : 'pointer',
                    }}
                >
                    ← Prev
                </button>

                <span style={{ minWidth: 80, textAlign: 'center', color: 'var(--text)' }}>
                    {page} / {totalPages}
                </span>

                {/* Next */}
                <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    style={{
                        padding: '4px 12px', borderRadius: 6, fontSize: 12,
                        background: page >= totalPages ? 'transparent' : 'rgba(255,255,255,0.06)',
                        border: '1px solid var(--border)',
                        color: page >= totalPages ? 'var(--text-secondary)' : 'var(--text)',
                        cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                    }}
                >
                    Next →
                </button>
            </div>
        </div>
    )
}
