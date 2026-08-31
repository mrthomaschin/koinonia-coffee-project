import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { notionService, WebsiteEvent } from '../../services/notionService';
import SEO from '../../components/SEO';
import NotionBody from '../../components/NotionBody';
import './Events.css';

const parseEventDate = (value: string): Date => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
};

const formatDate = (value: string, includeTime = true): string => new Intl.DateTimeFormat(undefined, {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
}).format(parseEventDate(value));

const monthKey = (date: Date): string => `${date.getFullYear()}-${date.getMonth()}`;

const Events: React.FC = () => {
  const [events, setEvents] = useState<WebsiteEvent[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    notionService.getEvents().then(setEvents).catch(() => setError('We could not load the event calendar right now.')).finally(() => setLoading(false));
  }, []);

  const monthEvents = useMemo(() => events.filter((event) => {
    const date = parseEventDate(event.start);
    return monthKey(date) === monthKey(selectedMonth);
  }), [events, selectedMonth]);

  const days = useMemo(() => {
    const first = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
    const count = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate();
    return Array.from({ length: first.getDay() + count }, (_, index) => index < first.getDay() ? null : index - first.getDay() + 1);
  }, [selectedMonth]);

  const eventsOnDay = (day: number): WebsiteEvent[] => monthEvents.filter((event) => parseEventDate(event.start).getDate() === day);
  const changeMonth = (offset: number) => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + offset, 1));

  return <main className="events-page">
    <SEO title="Events Calendar | Koinonia Coffee Project" description="Find Koinonia Coffee Project at upcoming pop-ups, markets, and community gatherings." path="/events" />
    <section className="events-heading"><p className="events-eyebrow">COME SAY HELLO</p><h1>See what<br />we're up to.</h1></section>
    {loading && <p className="events-status">Loading events…</p>}
    {error && <p className="events-status">{error}</p>}
    {!loading && !error && <section className="events-content">
      <div className="calendar-panel">
        <div className="calendar-header"><button onClick={() => changeMonth(-1)} aria-label="Previous month">←</button><h2>{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(selectedMonth)}</h2><button onClick={() => changeMonth(1)} aria-label="Next month">→</button></div>
        <div className="calendar-weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">{days.map((day, index) => <div className={`calendar-day ${day ? '' : 'empty'}`} key={`${day}-${index}`}>
          {day && <><span className="calendar-date">{day}</span>{eventsOnDay(day).map((event) => <Link className="calendar-event" key={event.id} to={`/events/${event.id}`}>{event.name}</Link>)}</>}
        </div>)}</div>
      </div>
      <div className="events-list"><p className="events-eyebrow">THIS MONTH</p>{monthEvents.length === 0 && <p>No events on the calendar this month.</p>}{monthEvents.map((event) => <Link to={`/events/${event.id}`} className="event-list-item" key={event.id}><span>{formatDate(event.start)}</span><strong>{event.name}</strong>{event.location && <small>{event.location}</small>}</Link>)}</div>
    </section>}
  </main>;
};

export const EventDetail: React.FC = () => {
  const id = window.location.pathname.split('/').pop();
  const [event, setEvent] = useState<WebsiteEvent | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { notionService.getEvents().then((events) => setEvent(events.find((item) => item.id === id) || null)).finally(() => setLoading(false)); }, [id]);
  if (loading) return <main className="event-detail-page"><p className="events-status">Loading event…</p></main>;
  if (!event) return <main className="event-detail-page"><p className="events-eyebrow">EVENT NOT FOUND</p><h1>That event has moved on.</h1><Link className="event-back-link" to="/events">BACK TO CALENDAR</Link></main>;
  return <main className="event-detail-page"><Link className="event-back-link" to="/events">← BACK TO CALENDAR</Link><p className="events-eyebrow">KOINONIA / EVENT</p><h1>{event.name}</h1><div className="event-meta"><span>{formatDate(event.start)}</span>{event.location && <span>{event.location}</span>}</div><article className="event-body"><NotionBody content={event.body} fallback="More details coming soon." /></article></main>;
};

export default Events;
