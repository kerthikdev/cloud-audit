/**
 * ResourceFilter — reusable search + region filter bar for all resource tables.
 * Props:
 *   items        — full list of resource rows
 *   onFiltered   — callback(filteredItems) called when filter changes
 *   regions      — optional list of unique regions to show in dropdown (auto-extracted if omitted)
 *
 * Usage:
 *   <ResourceFilter items={items} onFiltered={setFiltered} />
 */
import { useState, useEffect } from 'react'
import { Search, X, Filter } from 'lucide-react'

export default function ResourceFilter({ items, onFiltered, extraFields = [] }) {
    const [query, setQuery] = useState('')
    const [region, setRegion] = useState('all')

    // Extract unique regions from items
    const regions = ['all', ...new Set(items.map(r => r.region).filter(Boolean))]

    useEffect(() => {
        let filtered = items
        if (region !== 'all') {
            filtered = filtered.filter(r => r.region === region)
        }
        if (query.trim()) {
            const q = query.toLowerCase()
            filtered = filtered.filter(r => {
                const base = [r.name, r.resource_id, r.state, r.region]
                    .join(' ').toLowerCase()
                const extra = extraFields
                    .map(f => String(r.raw_data?.[f] ?? '')).join(' ').toLowerCase()
                return base.includes(q) || extra.includes(q)
            })
        }
        onFiltered(filtered)
    }, [query, region, items]) // eslint-disable-line

    const clear = () => { setQuery(''); setRegion('all') }
    const isActive = query || region !== 'all'

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 16, flexWrap: 'wrap',
        }}>
            {/* Search box */}
            <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
                <Search size={14} style={{
                    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--text-secondary)', pointerEvents: 'none',
                }} />
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search by name, ID, state…"
                    style={{
                        width: '100%', boxSizing: 'border-box',
                        paddingLeft: 32, paddingRight: query ? 32 : 12,
                        paddingTop: 7, paddingBottom: 7,
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--border)',
                        borderRadius: 8, color: 'var(--text)', fontSize: 13,
                        outline: 'none',
                    }}
                />
                {query && (
                    <button onClick={() => setQuery('')} style={{
                        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-secondary)', padding: 2,
                    }}>
                        <X size={13} />
                    </button>
                )}
            </div>

            {/* Region filter */}
            {regions.length > 2 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Filter size={13} color="var(--text-secondary)" />
                    <select
                        value={region}
                        onChange={e => setRegion(e.target.value)}
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid var(--border)',
                            borderRadius: 8, color: 'var(--text)', fontSize: 13,
                            padding: '6px 10px', cursor: 'pointer', outline: 'none',
                        }}
                    >
                        {regions.map(r => (
                            <option key={r} value={r} style={{ background: '#1e293b' }}>
                                {r === 'all' ? 'All regions' : r}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Active filter indicator */}
            {isActive && (
                <button onClick={clear} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 12, color: '#f59e0b', cursor: 'pointer',
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: 6, padding: '4px 10px',
                }}>
                    <X size={11} /> Clear filters
                </button>
            )}
        </div>
    )
}
