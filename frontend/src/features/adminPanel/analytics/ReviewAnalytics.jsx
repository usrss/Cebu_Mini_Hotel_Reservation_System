import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'var(--navy-card)', border:'1px solid var(--gold-border)', padding:'10px 14px', fontFamily:'Raleway,sans-serif', fontSize:12 }}>
      <p style={{ color:'var(--gold)', fontWeight:700, margin:'0 0 6px' }}>{label}</p>
      {payload.map((p,i) => <p key={i} style={{ color:p.color, margin:'2px 0' }}>{p.name}: <strong>{p.value}</strong></p>)}
    </div>
  );
}

const STAR_COLORS = ['#F87171','#FCD34D','#FCD34D','#6EE7B7','#C9A84C'];

export default function ReviewAnalytics({ stats }) {
  if (!stats) return <div className="an-loading"><div className="an-spinner" /><span>Loading…</span></div>;

  const breakdown = stats.rating_breakdown ?? {};
  const total     = stats.total_reviews ?? 0;
  const hidden    = stats.hidden_count  ?? 0;
  const avg       = stats.avg_rating ? Number(stats.avg_rating).toFixed(2) : '—';
  const topRooms  = stats.top_rooms ?? [];
  const trend     = stats.trend ?? {};

  const ratingData = [5,4,3,2,1].map(star => ({
    name:  `${star}★`,
    Count: breakdown[star] ?? 0,
  }));

  const topRoomData = topRooms.map(r => ({
    name:   `Room ${r.room__room_number}`,
    Rating: Number(r.avg).toFixed(1),
    Count:  r.count,
  }));

  return (
    <>
      <div className="an-alerts">
        {hidden > 3 && (
          <div className="an-alert an-alert--warning">👁 {hidden} review{hidden !== 1 ? 's are' : ' is'} hidden from guests.</div>
        )}
        {avg !== '—' && Number(avg) >= 4.5 && (
          <div className="an-alert an-alert--success">⭐ Excellent average rating of {avg}!</div>
        )}
        {avg !== '—' && Number(avg) < 3.5 && (
          <div className="an-alert an-alert--danger">⚠ Average rating is {avg} — address feedback urgently.</div>
        )}
      </div>

      <div className="an-grid-4">
        {[
          { label: 'Avg Rating',    value: `${avg} ★`, color: '#FCD34D' },
          { label: 'Total Reviews', value: total,       color: 'var(--gold)' },
          { label: 'Hidden',        value: hidden,      color: '#F87171' },
          { label: 'Last 30 Days',  value: trend.last_30_days ?? '—', color: '#6EE7B7',
            sub: `prev: ${trend.prev_30_days ?? 0}` },
        ].map((k,i) => (
          <div key={i} className="an-stat-box">
            <span className="an-stat-box-label">{k.label}</span>
            <span className="an-stat-box-value" style={{ color: k.color }}>{k.value}</span>
            {k.sub && <span className="an-stat-box-sub">{k.sub}</span>}
          </div>
        ))}
      </div>

      <div className="an-grid-chart-table">
        {/* Rating distribution bar chart */}
        <div className="an-card">
          <p className="an-card-eyebrow">Distribution</p>
          <h3 className="an-card-title">Star Rating Breakdown</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ratingData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,168,76,0.08)" />
              <XAxis dataKey="name" tick={{ fill:'rgba(248,246,240,0.45)', fontSize:12 }} />
              <YAxis tick={{ fill:'rgba(248,246,240,0.45)', fontSize:10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Count" radius={[2,2,0,0]}>
                {ratingData.map((_,i) => <Cell key={i} fill={STAR_COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top rooms bar chart */}
        <div className="an-card">
          <p className="an-card-eyebrow">Best Performers</p>
          <h3 className="an-card-title">Top Rated Rooms</h3>
          {topRoomData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topRoomData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,168,76,0.08)" horizontal={false} />
                <XAxis type="number" domain={[0, 5]} tick={{ fill:'rgba(248,246,240,0.45)', fontSize:10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill:'rgba(248,246,240,0.45)', fontSize:10 }} width={70} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Rating" name="Avg Rating" fill="#FCD34D" radius={[0,2,2,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="an-empty">No top room data.</div>}
        </div>
      </div>

      {topRooms.length > 0 && (
        <div className="an-card">
          <p className="an-card-eyebrow">Ranked</p>
          <h3 className="an-card-title">Top Rated Rooms</h3>
          <div className="an-table-wrap">
            <table className="an-table">
              <thead><tr><th>Rank</th><th>Room</th><th>Type</th><th>Avg Rating</th><th>Reviews</th></tr></thead>
              <tbody>
                {topRooms.map((r,i) => (
                  <tr key={i}>
                    <td>#{i+1}</td>
                    <td>Room {r.room__room_number}</td>
                    <td style={{ textTransform:'capitalize' }}>{r.room__room_type}</td>
                    <td style={{ color:'#FCD34D', fontWeight:700 }}>{Number(r.avg).toFixed(1)} ★</td>
                    <td>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}