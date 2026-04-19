import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import {
  ThumbsUp, ThumbsDown, Star, Eye, Award, MessageSquare,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
} from 'lucide-react';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#FFFFFF', border: 'none', borderRadius: 10,
      padding: '10px 14px', fontFamily: "'DM Sans', sans-serif",
      fontSize: 12, boxShadow: '0 4px 20px rgba(1,0,13,0.09)',
    }}>
      <p style={{ color: '#52515E', fontWeight: 700, margin: '0 0 6px' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: '2px 0' }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
}

function ReviewKpiCard({ icon, label, value, sub, color }) {
  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: 14,
      padding: '18px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      boxShadow: '0 2px 10px rgba(1,0,13,0.07), 0 1px 3px rgba(1,0,13,0.04)',
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 10,
        background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 26, fontWeight: 400, color: '#01000D',
          lineHeight: 1, marginBottom: 4, letterSpacing: '-0.02em',
        }}>
          {value}
        </div>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.10em',
          textTransform: 'uppercase', color: '#01000D',
        }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: '#7A7987', marginTop: 2 }}>{sub}</div>
        )}
      </div>
    </div>
  );
}

function StarBar({ star, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3,
        width: 32, flexShrink: 0,
        fontSize: 12, fontWeight: 700, color: '#01000D',
      }}>
        {star}<Star size={10} style={{ color: '#D97706', fill: '#D97706', marginLeft: 2 }} />
      </div>
      <div style={{
        flex: 1, height: 7, background: '#F2F3F7', borderRadius: 999, overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: color, borderRadius: 999,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{
        width: 36, textAlign: 'right', fontSize: 11,
        color: '#52515E', fontWeight: 600, flexShrink: 0,
      }}>
        {count}
      </div>
      <div style={{
        width: 32, textAlign: 'right', fontSize: 10,
        color: '#7A7987', flexShrink: 0,
      }}>
        {pct}%
      </div>
    </div>
  );
}

const STAR_COLORS = ['#D97706', '#6EE7B7', '#FCD34D', '#FCD34D', '#F87171'];

export default function ReviewAnalytics({ stats }) {
  if (!stats) return <div className="an-loading"><div className="an-spinner" /><span>Loading…</span></div>;

  const breakdown = stats.rating_breakdown ?? {};
  const total     = stats.total_reviews ?? 0;
  const hidden    = stats.hidden_count  ?? 0;
  const avg       = stats.avg_rating ? Number(stats.avg_rating).toFixed(2) : '—';
  const topRooms  = stats.top_rooms ?? [];
  const trend     = stats.trend ?? {};

  const h = stats.helpfulness ?? {};
  const totalHelpful    = h.total_helpful     ?? 0;
  const totalNotHelpful = h.total_not_helpful ?? 0;
  const totalVotes      = h.total_votes       ?? 0;
  const helpfulRatio    = h.helpfulness_ratio;
  const mostHelpful     = h.most_helpful_reviews ?? [];

  const ratingData = [5, 4, 3, 2, 1].map(star => ({
    name:  `${star}★`,
    Count: breakdown[star] ?? 0,
  }));

  const topRoomData = topRooms.map(r => ({
    name:   `Room ${r.room__room_number}`,
    Rating: Number(r.avg).toFixed(1),
    Count:  r.count,
  }));

  const helpfulChartData = mostHelpful.map(r => ({
    name:          `Room ${r.room__room_number} · ${r.display_name}`,
    'Helpful':     r.helpful_count,
    'Not Helpful': r.not_helpful_count,
  }));

  const trendDelta = (trend.last_30_days ?? 0) - (trend.prev_30_days ?? 0);

  return (
    <>
      {/* Alerts */}
      <div className="an-alerts">
        {hidden > 3 && (
          <div className="an-alert an-alert--warning" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Eye size={14} /> {hidden} review{hidden !== 1 ? 's are' : ' is'} hidden from guests.
          </div>
        )}
        {avg !== '—' && Number(avg) >= 4.5 && (
          <div className="an-alert an-alert--success" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={14} /> Excellent average rating of {avg} — keep it up!
          </div>
        )}
        {avg !== '—' && Number(avg) < 3.5 && (
          <div className="an-alert an-alert--danger" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} /> Average rating is {avg} — address feedback urgently.
          </div>
        )}
      </div>

      {/* Primary KPI cards */}
      <div className="an-grid-4">
        <ReviewKpiCard
          icon={<Star size={20} style={{ fill: '#D97706', color: '#D97706' }} />}
          label="Avg Rating"
          value={avg === '—' ? '—' : `${avg}★`}
          sub="Overall score"
          color="#D97706"
        />
        <ReviewKpiCard
          icon={<MessageSquare size={20} />}
          label="Total Reviews"
          value={total}
          sub="All time"
          color="#3B5BDB"
        />
        <ReviewKpiCard
          icon={<Eye size={20} />}
          label="Hidden"
          value={hidden}
          sub={hidden > 0 ? 'From guests' : 'None hidden'}
          color="#DC2626"
        />
        <ReviewKpiCard
          icon={trendDelta >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          label="Last 30 Days"
          value={trend.last_30_days ?? '—'}
          sub={`prev: ${trend.prev_30_days ?? 0} reviews`}
          color="#0D9488"
        />
      </div>

      {/* Helpfulness KPI cards */}
      <div className="an-grid-4">
        <ReviewKpiCard
          icon={<ThumbsUp size={20} />}
          label="Helpful Votes"
          value={totalHelpful}
          sub="Marked helpful"
          color="#0D9488"
        />
        <ReviewKpiCard
          icon={<ThumbsDown size={20} />}
          label="Not Helpful"
          value={totalNotHelpful}
          sub="Marked not helpful"
          color="#DC2626"
        />
        <ReviewKpiCard
          icon={<MessageSquare size={20} />}
          label="Total Votes"
          value={totalVotes}
          sub="All helpfulness votes"
          color="#3B5BDB"
        />
        <ReviewKpiCard
          icon={<Award size={20} />}
          label="Helpfulness Ratio"
          value={helpfulRatio != null ? `${helpfulRatio}%` : '—'}
          sub="Helpful vs total"
          color={
            helpfulRatio != null && helpfulRatio >= 70 ? '#0D9488' :
            helpfulRatio != null && helpfulRatio >= 50 ? '#D97706' : '#DC2626'
          }
        />
      </div>

      {/* Rating breakdown + Top rooms */}
      <div className="an-grid-chart-table">
        <div className="an-card">
          <p className="an-card-eyebrow">Distribution</p>
          <h3 className="an-card-title">Star Rating Breakdown</h3>
          <div style={{ marginTop: 16 }}>
            {[5, 4, 3, 2, 1].map((star, i) => (
              <StarBar
                key={star}
                star={star}
                count={breakdown[star] ?? 0}
                total={total}
                color={STAR_COLORS[i]}
              />
            ))}
          </div>
          <div style={{ marginTop: 20 }}>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={ratingData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(1,0,13,0.05)" />
                <XAxis dataKey="name" tick={{ fill: '#7A7987', fontSize: 11 }} />
                <YAxis tick={{ fill: '#7A7987', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Count" radius={[3, 3, 0, 0]}>
                  {ratingData.map((_, i) => <Cell key={i} fill={STAR_COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="an-card">
          <p className="an-card-eyebrow">Best Performers</p>
          <h3 className="an-card-title">Top Rated Rooms</h3>
          {topRoomData.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topRoomData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(1,0,13,0.05)" horizontal={false} />
                <XAxis type="number" domain={[0, 5]} tick={{ fill: '#7A7987', fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#7A7987', fontSize: 10 }} width={70} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Rating" name="Avg Rating" fill="#D97706" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="an-empty">No top room data.</div>}
        </div>
      </div>

      {/* Most Helpful Reviews */}
      {mostHelpful.length > 0 && (
        <div className="an-grid-chart-table">
          <div className="an-card">
            <p className="an-card-eyebrow">Engagement</p>
            <h3 className="an-card-title">Most Helpful Reviews</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={helpfulChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(1,0,13,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#7A7987', fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#52515E', fontSize: 10 }} width={160} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Helpful"     stackId="votes" fill="#0D9488" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Not Helpful" stackId="votes" fill="#DC2626" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="an-card">
            <p className="an-card-eyebrow">Ranked</p>
            <h3 className="an-card-title">Most Helpful Reviews</h3>
            <div className="an-table-wrap">
              <table className="an-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Guest</th>
                    <th>Rating</th>
                    <th>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ThumbsUp size={11} /> Helpful
                      </span>
                    </th>
                    <th>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ThumbsDown size={11} /> Not
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mostHelpful.map((r, i) => (
                    <tr key={i}>
                      <td>Room {r.room__room_number}</td>
                      <td>{r.display_name}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#D97706', fontWeight: 700 }}>
                          {r.rating}<Star size={10} style={{ fill: '#D97706', color: '#D97706' }} />
                        </span>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#0D9488', fontWeight: 600 }}>
                          <ThumbsUp size={11} /> {r.helpful_count}
                        </span>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#DC2626', fontWeight: 600 }}>
                          <ThumbsDown size={11} /> {r.not_helpful_count}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Top rated rooms table */}
      {topRooms.length > 0 && (
        <div className="an-card">
          <div className="an-card-header">
            <div>
              <p className="an-card-eyebrow">Ranked</p>
              <h3 className="an-card-title">Top Rated Rooms</h3>
            </div>
          </div>
          <div className="an-table-wrap">
            <table className="an-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Room</th>
                  <th>Type</th>
                  <th>Avg Rating</th>
                  <th>Reviews</th>
                </tr>
              </thead>
              <tbody>
                {topRooms.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22, borderRadius: '50%',
                        background: i === 0 ? '#D97706' : i === 1 ? '#9CA3AF' : i === 2 ? '#B45309' : '#F2F3F7',
                        color: i < 3 ? '#FFFFFF' : '#52515E',
                        fontSize: 10, fontWeight: 700,
                      }}>
                        {i + 1}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>Room {r.room__room_number}</td>
                    <td style={{ textTransform: 'capitalize' }}>{r.room__room_type}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#D97706', fontWeight: 700 }}>
                        <Star size={12} style={{ fill: '#D97706', color: '#D97706' }} />
                        {Number(r.avg).toFixed(1)}
                      </span>
                    </td>
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