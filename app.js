'use strict';

const SUPABASE = 'https://jbvkjvdthuzofvmhwctv.supabase.co/rest/v1/';
const KEY = 'sb_publishable_hbxcjbYF5H8py5gGLokxPg_tD9nGsNl';
const CACHE = 'trip-data-v1';
const KINDS = { food: '🍜', sight: '⛩️', shop: '🛍️', flight: '✈️', train: '🚄', other: '📌' };
const KIND_NAMES = { food: 'Food', sight: 'Sight', shop: 'Shopping', flight: 'Flight', train: 'Train', other: 'Other' };

let S = { days: [], stays: [], places: [], items: [] };
let placeFilter = { q: '', city: '', cat: '', starred: false };
const $ = s => document.querySelector(s);

// ---------- data ----------

async function api(method, path, body) {
    const headers = { apikey: KEY, 'Content-Type': 'application/json' };
    if (method !== 'GET') headers.Prefer = 'return=minimal';
    const r = await fetch(SUPABASE + path, { method, headers, body: body && JSON.stringify(body) });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return method === 'GET' ? r.json() : null;
}

function cacheSave() {
    try { localStorage.setItem(CACHE, JSON.stringify(S)); } catch {}
}

async function refresh() {
    try {
        const [days, stays, places, items] = await Promise.all([
            api('GET', 'trip_days?order=date'),
            api('GET', 'trip_stays?order=check_in'),
            api('GET', 'trip_places?order=city,category,name'),
            api('GET', 'trip_items?order=date,sort'),
        ]);
        S = { days, stays, places, items };
        cacheSave();
        // Don't yank the search box out from under someone typing; the next render picks it up.
        if (!document.activeElement?.matches('input,textarea,select')) render();
    } catch (e) {
        if (!S.days.length) $('#main').innerHTML = `<div class="empty">Couldn't load the trip. Check your connection and pull to refresh.</div>`;
    }
}

// Updates the screen first, then the database, so the app feels instant on a slow connection.
async function save(table, row, key = 'id') {
    const list = S[table.replace('trip_', '')];
    const i = list.findIndex(r => r[key] === row[key]);
    if (i >= 0) list[i] = { ...list[i], ...row }; else list.push(row);
    cacheSave();
    render();
    try {
        if (i >= 0) await api('PATCH', `${table}?${key}=eq.${encodeURIComponent(row[key])}`, row);
        else await api('POST', table, row);
    } catch (e) {
        toast("Couldn't save. Are you offline?");
        console.error(e);
    }
}

async function remove(table, id) {
    const name = table.replace('trip_', '');
    S[name] = S[name].filter(r => r.id !== id);
    cacheSave();
    render();
    try { await api('DELETE', `${table}?id=eq.${id}`); } catch { toast("Couldn't delete. Are you offline?"); }
}

// ---------- helpers ----------

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const linkify = s => esc(s).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${u.length > 40 ? u.slice(0, 40) + '…' : u}</a>`);
const uid = () => crypto.randomUUID();
const parse = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); };
const iso = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const fmt = (d, o = { weekday: 'short', day: 'numeric', month: 'short' }) => parse(d).toLocaleDateString('en-GB', o);
const todayIso = () => iso(new Date());
const nowHM = () => new Date().toTimeString().slice(0, 5);
const mapsSearch = q => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
const placeOf = it => it.place_id && S.places.find(p => p.id === it.place_id);
const dayNum = d => S.days.findIndex(x => x.date === d) + 1;
const stayOn = d => S.stays.find(s => s.check_in <= d && d < s.check_out);
const itemsOn = d => S.items.filter(i => i.date === d)
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || a.sort - b.sort);

function navUrl(it) {
    const p = placeOf(it);
    if (it.maps_url) return it.maps_url;
    if (p?.maps_url) return p.maps_url;
    if (it.address) return mapsSearch(`${it.title}, ${it.address}`);
    return '';
}

function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._h);
    t._h = setTimeout(() => (t.hidden = true), 2600);
}

async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast(text); }
}

// ---------- routing ----------

function route() {
    const h = location.hash.slice(1) || 'today';
    const [view, arg] = h.split('/');
    return { view, arg };
}

function render() {
    const { view, arg } = route();
    const tab = view === 'day' ? 'days' : view;
    document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
    const need = S.items.filter(i => i.booking_status === 'needed').length;
    const badge = $('#tobook-badge');
    badge.hidden = !need;
    badge.textContent = need;

    let date = null;
    if (view === 'today') date = currentTripDate();
    if (view === 'day') date = arg;
    document.body.dataset.view = view;
    const main = $('#main');
    if (!S.days.length) { main.innerHTML = '<div class="empty">Loading the trip…</div>'; return; }
    if (view === 'places') main.innerHTML = placesView();
    else if (view === 'bookings') main.innerHTML = bookingsView();
    else if (view === 'days') main.innerHTML = daysView();
    else main.innerHTML = dayView(date, view === 'today');
    const strip = document.querySelector('.strip'), on = strip?.querySelector('.on');
    if (on) strip.scrollLeft = on.offsetLeft - strip.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2;
    if (view === 'today') document.querySelector('.item.next')?.scrollIntoView({ block: 'center' });
}

// The trip day to open on "Today": today during the trip, otherwise the nearest end.
function currentTripDate() {
    const t = todayIso();
    const first = S.days[0]?.date, last = S.days.at(-1)?.date;
    if (!first) return null;
    if (t < first) return first;
    if (t > last) return last;
    return t;
}

// ---------- views ----------

// Scrollable row of dates above a day, for jumping around without a sidebar.
function dayStrip(active) {
    const t = todayIso();
    return `<nav class="strip">${S.days.map(d => `
        <a href="#day/${d.date}" class="${d.date === active ? 'on' : ''} ${d.date === t ? 'is-today' : ''} ${d.date < t ? 'past' : ''}">
            <small>${fmt(d.date, { weekday: 'short' })}</small><b>${fmt(d.date, { day: 'numeric' })}</b><small>${esc(d.city.split(/[ (→]/)[0])}</small>
        </a>`).join('')}</nav>`;
}

function dayView(date, isToday) {
    const d = S.days.find(x => x.date === date);
    if (!d) return '<div class="empty">That day isn\'t in the trip.</div>';
    const i = S.days.indexOf(d);
    const prev = S.days[i - 1], next = S.days[i + 1];
    const t = todayIso();
    const live = date === t;
    let banner = '';
    if (isToday && t < S.days[0].date) {
        const n = Math.round((parse(S.days[0].date) - parse(t)) / 864e5);
        const need = S.items.filter(x => x.booking_status === 'needed').length;
        banner = `<div class="banner">Trip starts in <b>${n} day${n === 1 ? '' : 's'}</b>.${need ? ` <a href="#bookings">${need} thing${need === 1 ? '' : 's'} still to book →</a>` : ''}<br><small>Here's day 1.</small></div>`;
    }
    const items = itemsOn(date);
    const nextId = live ? (items.find(x => !x.done && (!x.time || x.time >= nowHM())) || items.find(x => !x.done))?.id : null;
    return `
        ${banner}
        ${dayStrip(date)}
        <header class="dayhead">
            ${prev ? `<a class="arrow" href="#day/${prev.date}" aria-label="Previous day">‹</a>` : '<span class="arrow"></span>'}
            <div class="dh">
                <div class="eyebrow">Day ${i + 1} · ${fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })}${live ? ' · <span class="live">Today</span>' : ''}</div>
                <h1>${esc(d.title || d.city)}</h1>
                <div class="city">${esc(d.city)} <button class="link" onclick="editDay('${date}')">Edit</button></div>
            </div>
            ${next ? `<a class="arrow" href="#day/${next.date}" aria-label="Next day">›</a>` : '<span class="arrow"></span>'}
        </header>
        ${d.notes ? `<p class="daynotes">${linkify(d.notes)}</p>` : ''}
        ${stayCard(date)}
        <section class="timeline">
            ${items.length ? items.map(x => itemCard(x, x.id === nextId)).join('') : '<div class="empty small">Nothing planned yet.</div>'}
        </section>
        <div class="addrow">
            <button class="btn" onclick="pickPlace('${date}')">+ Add from places</button>
            <button class="btn ghost" onclick="editItem(null,'${date}')">+ Add something else</button>
        </div>`;
}

function stayCard(date) {
    const s = stayOn(date);
    if (!s) return '';
    const checkIn = s.check_in === date;
    const url = s.maps_url || (s.address && mapsSearch(`${s.name}, ${s.address}`));
    return `
        <section class="stay">
            <div class="stay-top">
                <span class="tag">${checkIn ? 'Check in tonight' : 'Staying at'}</span>
                <button class="link" onclick="editStay('${s.id}')">Edit</button>
            </div>
            <h2>${esc(s.name)}</h2>
            ${s.address ? `<p class="addr">${esc(s.address)}</p>` : ''}
            ${s.confirmation ? `<p class="conf">Confirmation <b>${esc(s.confirmation)}</b></p>` : ''}
            ${s.notes ? `<p class="muted">${linkify(s.notes)}</p>` : ''}
            <div class="actions">
                ${url ? `<a class="btn nav" href="${esc(url)}" target="_blank" rel="noopener">Navigate</a>` : ''}
                ${s.address ? `<button class="btn ghost" onclick="showAddress('${s.id}')">Show driver</button>` : ''}
            </div>
        </section>`;
}

function bookingChip(x) {
    if (x.booking_status === 'needed') return '<span class="chip warn">Needs booking</span>';
    if (x.booking_status !== 'booked') return '';
    const bits = [x.booking_time, x.party && `${x.party} ppl`, x.confirmation && `#${x.confirmation}`].filter(Boolean).map(esc);
    return `<span class="chip ok">Booked${bits.length ? ' · ' + bits.join(' · ') : ''}</span>`;
}

function itemCard(x, isNext) {
    const url = navUrl(x);
    const p = placeOf(x);
    const sub = [p?.area, x.address || p?.address].filter(Boolean)[0];
    const notes = [x.notes, p?.notes].filter(Boolean).join('\n');
    return `
        <article class="item k-${esc(x.kind)} ${x.done ? 'done' : ''} ${isNext ? 'next' : ''}">
            <button class="check" onclick="toggleDone('${x.id}')" aria-label="Mark done">${x.done ? '✓' : ''}</button>
            <div class="when">${esc(x.time) || ''}</div>
            <div class="body">
                <div class="title-row">
                    <span class="kind">${KINDS[x.kind] || '📌'}</span>
                    <h3>${esc(x.title)}</h3>
                    ${isNext ? '<span class="chip next-chip">Next</span>' : ''}
                </div>
                ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
                ${bookingChip(x)}
                ${notes ? `<div class="notes" onclick="this.classList.toggle('open')">${linkify(notes)}</div>` : ''}
                <div class="actions">
                    ${url ? `<a class="btn nav" href="${esc(url)}" target="_blank" rel="noopener">Navigate</a>` : ''}
                    ${x.booking_url ? `<a class="btn ghost" href="${esc(x.booking_url)}" target="_blank" rel="noopener">Booking</a>` : ''}
                    <button class="btn ghost" onclick="editItem('${x.id}')">Edit</button>
                </div>
            </div>
        </article>`;
}

function daysView() {
    const t = todayIso();
    return `
        <h1 class="page">All days</h1>
        <div class="daygrid">
            ${S.days.map((d, i) => {
                const items = itemsOn(d.date);
                const s = stayOn(d.date);
                const need = items.filter(x => x.booking_status === 'needed').length;
                return `
                <a class="daycard ${d.date === t ? 'is-today' : ''} ${d.date < t ? 'past' : ''}" href="#day/${d.date}">
                    <div class="dc-top"><span class="n">Day ${i + 1}</span><span>${fmt(d.date)}</span></div>
                    <h3>${esc(d.title || d.city)}</h3>
                    <div class="muted">${esc(d.city)}</div>
                    ${items.length ? `<ul>${items.slice(0, 5).map(x => `<li>${KINDS[x.kind] || ''} ${x.time ? `<b>${esc(x.time)}</b> ` : ''}${esc(x.title)}</li>`).join('')}${items.length > 5 ? `<li class="muted">+${items.length - 5} more</li>` : ''}</ul>` : ''}
                    <div class="dc-foot">
                        ${s ? `<span>🛏 ${esc(s.name)}</span>` : ''}
                        ${need ? `<span class="chip warn">${need} to book</span>` : ''}
                    </div>
                </a>`;
            }).join('')}
        </div>`;
}

function filteredPlaces() {
    const q = placeFilter.q.toLowerCase();
    return S.places.filter(p =>
        (!placeFilter.city || p.city === placeFilter.city) &&
        (!placeFilter.cat || p.category === placeFilter.cat) &&
        (!placeFilter.starred || p.starred) &&
        (!q || `${p.name} ${p.area} ${p.category} ${p.notes} ${p.address}`.toLowerCase().includes(q)))
        .sort((a, b) => GROUPS.indexOf(groupOf(a)) - GROUPS.indexOf(groupOf(b)) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

// Broad sections for the place lists; every meal type (ramen, sushi, BBQ…) falls under Food.
const GROUPS = ['Matcha', 'Food', 'Coffee', 'Dessert', 'Places'];
const groupOf = p => /matcha/i.test(p.category) ? 'Matcha' : GROUPS.includes(p.category) ? p.category : 'Food';

function grouped(list, row) {
    if (!list.length) return '<div class="empty small">No places match.</div>';
    return GROUPS.map(g => {
        const inG = list.filter(p => groupOf(p) === g);
        return inG.length ? `<h3 class="grp">${g} <span>${inG.length}</span></h3>${inG.map(row).join('')}` : '';
    }).join('');
}

function placeFilters() {
    const cities = [...new Set(S.places.map(p => p.city).filter(Boolean))];
    const cats = [...new Set(S.places.filter(p => !placeFilter.city || p.city === placeFilter.city).map(p => p.category).filter(Boolean))].sort();
    return `
        <div class="filters">
            <input type="search" placeholder="Search places, areas, food…" value="${esc(placeFilter.q)}" oninput="setFilter('q', this.value)">
            <div class="chips">
                <select class="${placeFilter.cat ? 'on' : ''}" onchange="setFilter('cat', this.value)">
                    <option value="">Any type</option>
                    ${cats.map(c => `<option ${placeFilter.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                </select>
                <button class="fchip ${!placeFilter.city ? 'on' : ''}" onclick="setFilter('city','')">All</button>
                ${cities.map(c => `<button class="fchip ${placeFilter.city === c ? 'on' : ''}" onclick="setFilter('city', ${esc(JSON.stringify(c))})">${esc(c)}</button>`).join('')}
                <button class="fchip ${placeFilter.starred ? 'on' : ''}" onclick="setFilter('starred', ${!placeFilter.starred})">★ Favourites</button>
            </div>
        </div>`;
}

function placesView() {
    const list = filteredPlaces();
    return `
        <div class="pagehead"><h1 class="page">Places</h1><button class="btn" onclick="editPlace(null)">+ Add place</button></div>
        ${placeFilters()}
        <div id="placelist" class="places">${grouped(list, placeCard)}</div>`;
}

function placeCard(p) {
    const planned = S.items.filter(i => i.place_id === p.id).map(i => i.date);
    return `
        <article class="place">
            <div class="title-row">
                <button class="star ${p.starred ? 'on' : ''}" onclick="toggleStar('${p.id}')" aria-label="Favourite">${p.starred ? '★' : '☆'}</button>
                <h3>${esc(p.name)}</h3>
            </div>
            <div class="sub">${[p.category, p.area || p.city].filter(Boolean).map(esc).join(' · ')}</div>
            ${addrLink(p)}
            ${p.notes ? `<p class="muted">${linkify(p.notes)}</p>` : ''}
            ${planned.length ? `<div class="chip ok">On ${planned.map(d => fmt(d, { day: 'numeric', month: 'short' })).join(', ')}</div>` : ''}
            <div class="actions">
                ${p.maps_url ? `<a class="btn nav" href="${esc(p.maps_url)}" target="_blank" rel="noopener">Map</a>` : ''}
                <select class="btn ghost" onchange="addPlaceTo('${p.id}', this.value); this.value=''">
                    <option value="">Add to day…</option>
                    ${S.days.map((d, i) => `<option value="${d.date}">Day ${i + 1} · ${fmt(d.date)} · ${esc(d.city)}</option>`).join('')}
                </select>
                <button class="btn ghost" onclick="editPlace('${p.id}')">Edit</button>
            </div>
        </article>`;
}

// Tapping the address opens it in Maps, to check it's the right branch before adding it.
const addrLink = p => p.address
    ? `<a class="maddr" href="${esc(p.maps_url || mapsSearch(`${p.name}, ${p.address}`))}" target="_blank" rel="noopener">${esc(p.address)}</a>`
    : '<span class="maddr none">No address yet</span>';

// Pop-up list of saved places; Add drops one into the day and keeps the list open for more.
function pickPlace(date) {
    const city = S.days.find(d => d.date === date)?.city || '';
    placeFilter.city = [...new Set(S.places.map(p => p.city))].find(c => c && city.includes(c)) || '';
    placeFilter.q = '';
    openSheet(`
        <div class="sheet-head"><h2>Add to Day ${dayNum(date)} · ${fmt(date)}</h2><button type="button" class="link" onclick="closeSheet()">Done</button></div>
        <div id="picker" data-date="${date}">${pickerBody(date)}</div>`);
}

function pickerBody(date) {
    const list = filteredPlaces();
    const on = new Set(S.items.filter(i => i.date === date).map(i => i.place_id));
    return `${placeFilters()}
        <div class="mini">
            ${grouped(list, p => `
                <div class="mini-row">
                    <div class="mini-text"><b>${p.starred ? '★ ' : ''}${esc(p.name)}</b><small>${[p.category, p.area].filter(Boolean).map(esc).join(' · ')}</small>${addrLink(p)}</div>
                    ${on.has(p.id) ? '<span class="chip ok">Added</span>' : `<button type="button" class="btn small" onclick="addPlaceTo('${p.id}','${date}')">Add</button>`}
                </div>`)}
        </div>`;
}

function bookingsView() {
    const need = S.items.filter(i => i.booking_status === 'needed').sort((a, b) => a.date.localeCompare(b.date));
    const booked = S.items.filter(i => i.booking_status === 'booked').sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
    const row = x => `
        <div class="brow" onclick="editItem('${x.id}')">
            <div class="bdate"><b>${fmt(x.date, { day: 'numeric' })}</b><small>${fmt(x.date, { month: 'short' })}</small></div>
            <div><b>${KINDS[x.kind] || ''} ${esc(x.title)}</b><small>Day ${dayNum(x.date)} · ${esc(S.days.find(d => d.date === x.date)?.city || '')}</small>${bookingChip(x)}</div>
        </div>`;
    const stays = S.stays.map(s => `
        <div class="brow" onclick="editStay('${s.id}')">
            <div class="bdate"><b>${fmt(s.check_in, { day: 'numeric' })}</b><small>${fmt(s.check_in, { month: 'short' })}</small></div>
            <div><b>🛏 ${esc(s.name)}</b><small>${fmt(s.check_in)} → ${fmt(s.check_out)}</small>${s.confirmation ? `<span class="chip ok">#${esc(s.confirmation)}</span>` : '<span class="chip">No confirmation # yet</span>'}</div>
        </div>`).join('');
    return `
        <h1 class="page">Bookings</h1>
        <h2 class="sec">Still to book <span class="count">${need.length}</span></h2>
        <div class="blist">${need.map(row).join('') || '<div class="empty small">Everything is booked. 🎉</div>'}</div>
        <h2 class="sec">Booked</h2>
        <div class="blist">${booked.map(row).join('') || '<div class="empty small">Nothing booked yet.</div>'}</div>
        <h2 class="sec">Hotels</h2>
        <div class="blist">${stays}</div>`;
}

// ---------- actions ----------

function setFilter(k, v) {
    placeFilter[k] = v;
    const picker = $('#picker');
    // Re-render just the list so the search box keeps focus while typing.
    const refocus = () => { const b = document.querySelector(picker ? '#picker input[type=search]' : '#main input[type=search]'); if (k === 'q') { b.focus(); b.setSelectionRange(v.length, v.length); } };
    if (picker) { picker.innerHTML = pickerBody(picker.dataset.date); refocus(); return; }
    if (k === 'q') { $('#placelist').innerHTML = grouped(filteredPlaces(), placeCard); return; }
    render();
}

function toggleDone(id) {
    const x = S.items.find(i => i.id === id);
    save('trip_items', { id, done: !x.done });
}

function toggleStar(id) {
    const p = S.places.find(i => i.id === id);
    save('trip_places', { id, starred: !p.starred });
}

function addPlaceTo(placeId, date) {
    if (!date) return;
    const p = S.places.find(x => x.id === placeId);
    const kind = /place|sight|temple/i.test(p.category) ? 'sight' : 'food';
    const sort = Math.max(0, ...S.items.filter(i => i.date === date).map(i => i.sort)) + 1;
    save('trip_items', {
        id: uid(), date, time: '', kind, title: p.name, place_id: p.id, address: '', maps_url: '', notes: '',
        booking_status: 'none', booking_time: '', party: '', confirmation: '', booking_url: '', done: false, sort,
    });
    toast(`Added to Day ${dayNum(date)}`);
    if ($('#picker')) $('#picker').innerHTML = pickerBody(date);
}

// ---------- edit sheets ----------

function openSheet(html) {
    const s = $('#sheet');
    s.innerHTML = `<div class="sheet-bg" onclick="closeSheet()"></div><form class="sheet-card" onsubmit="event.preventDefault()">${html}</form>`;
    s.hidden = false;
    document.body.classList.add('locked');
    // Don't pop the phone keyboard over the place list.
    if (!s.querySelector('#picker')) s.querySelector('input,textarea')?.focus({ preventScroll: true });
}

function closeSheet() {
    $('#sheet').hidden = true;
    document.body.classList.remove('locked');
}

const field = (name, label, value, type = 'text', extra = '') =>
    `<label class="f"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const area = (name, label, value) =>
    `<label class="f"><span>${label}</span><textarea name="${name}" rows="4">${esc(value)}</textarea></label>`;
const formData = () => Object.fromEntries(new FormData($('#sheet form')));

function editItem(id, date) {
    const x = id ? S.items.find(i => i.id === id) : {
        id: uid(), date, time: '', kind: 'food', title: '', place_id: null, address: '', maps_url: '', notes: '',
        booking_status: 'none', booking_time: '', party: '', confirmation: '', booking_url: '', done: false,
        sort: Math.max(0, ...S.items.filter(i => i.date === date).map(i => i.sort)) + 1,
    };
    const p = placeOf(x);
    openSheet(`
        <div class="sheet-head"><h2>${id ? 'Edit' : 'Add'} plan</h2><button type="button" class="link" onclick="closeSheet()">Cancel</button></div>
        ${field('title', 'What', x.title, 'text', 'required placeholder="e.g. Lunch at Udon Shin"')}
        <div class="two">
            ${field('time', 'Time', x.time, 'time')}
            <label class="f"><span>Type</span><select name="kind">${Object.entries(KIND_NAMES).map(([k, v]) => `<option value="${k}" ${x.kind === k ? 'selected' : ''}>${KINDS[k]} ${v}</option>`).join('')}</select></label>
        </div>
        <label class="f"><span>Day</span><select name="date">${S.days.map((d, i) => `<option value="${d.date}" ${d.date === x.date ? 'selected' : ''}>Day ${i + 1} · ${fmt(d.date)} · ${esc(d.city)}</option>`).join('')}</select></label>
        ${field('place', 'Saved place (optional)', p?.name || '', 'text', 'list="placenames" placeholder="Start typing a place name"')}
        <datalist id="placenames">${S.places.map(pl => `<option value="${esc(pl.name)}">`).join('')}</datalist>
        ${field('maps_url', 'Google Maps link', x.maps_url, 'url', 'placeholder="Paste the share link so Navigate goes to the right branch"')}
        ${field('address', 'Address', x.address)}
        ${area('notes', 'Notes', x.notes)}
        <fieldset class="booking">
            <legend>Reservation</legend>
            <div class="seg">${['none', 'needed', 'booked'].map(s => `<label><input type="radio" name="booking_status" value="${s}" ${x.booking_status === s ? 'checked' : ''}><span>${{ none: 'Not needed', needed: 'To book', booked: 'Booked' }[s]}</span></label>`).join('')}</div>
            <div class="two">
                ${field('booking_time', 'Reserved for', x.booking_time, 'time')}
                ${field('party', 'People', x.party, 'number', 'min="1"')}
            </div>
            ${field('confirmation', 'Confirmation #', x.confirmation)}
            ${field('booking_url', 'Booking link', x.booking_url, 'url')}
        </fieldset>
        <div class="sheet-foot">
            ${id ? `<button type="button" class="btn danger" onclick="if(confirmDelete())remove('trip_items','${x.id}'),closeSheet()">Delete</button>` : '<span></span>'}
            <button class="btn" onclick="saveItem('${x.id}', ${x.sort})">Save</button>
        </div>`);
}

function confirmDelete() {
    const b = event.target;
    if (b.dataset.armed) return true;
    b.dataset.armed = 1;
    b.textContent = 'Tap again to delete';
    return false;
}

function saveItem(id, sort) {
    const f = formData();
    if (!f.title.trim()) return toast('Give it a name');
    const p = S.places.find(pl => pl.name === f.place.trim());
    const old = S.items.find(i => i.id === id);
    const row = {
        id, date: f.date, time: f.time, kind: f.kind, title: f.title.trim(), place_id: p ? p.id : null,
        address: f.address.trim(), maps_url: f.maps_url.trim(), notes: f.notes,
        booking_status: f.booking_status, booking_time: f.booking_time, party: f.party,
        confirmation: f.confirmation.trim(), booking_url: f.booking_url.trim(),
        done: old?.done ?? false, sort: old?.sort ?? sort,
    };
    closeSheet();
    save('trip_items', row);
}

function editPlace(id) {
    const p = id ? S.places.find(x => x.id === id) : { id: uid(), name: '', city: placeFilter.city || 'Tokyo', category: '', area: '', address: '', maps_url: '', notes: '', starred: false };
    openSheet(`
        <div class="sheet-head"><h2>${id ? 'Edit' : 'Add'} place</h2><button type="button" class="link" onclick="closeSheet()">Cancel</button></div>
        ${field('name', 'Name', p.name, 'text', 'required')}
        <div class="two">${field('city', 'City', p.city)}${field('category', 'Type', p.category, 'text', 'placeholder="Ramen, Matcha…"')}</div>
        ${field('area', 'Area', p.area)}
        ${field('address', 'Address', p.address)}
        ${field('maps_url', 'Google Maps link', p.maps_url, 'url', 'placeholder="Paste the share link for the exact branch"')}
        ${area('notes', 'Notes', p.notes)}
        <div class="sheet-foot">
            ${id ? `<button type="button" class="btn danger" onclick="if(confirmDelete())remove('trip_places','${p.id}'),closeSheet()">Delete</button>` : '<span></span>'}
            <button class="btn" onclick="savePlace('${p.id}', ${p.starred})">Save</button>
        </div>`);
}

function savePlace(id, starred) {
    const f = formData();
    if (!f.name.trim()) return toast('Give it a name');
    const maps = f.maps_url.trim() || mapsSearch(f.address.trim() ? `${f.name}, ${f.address}` : `${f.name} ${f.city}`);
    closeSheet();
    save('trip_places', { id, name: f.name.trim(), city: f.city.trim(), category: f.category.trim(), area: f.area.trim(), address: f.address.trim(), maps_url: maps, notes: f.notes, starred });
}

function editStay(id) {
    const s = S.stays.find(x => x.id === id);
    openSheet(`
        <div class="sheet-head"><h2>Hotel</h2><button type="button" class="link" onclick="closeSheet()">Cancel</button></div>
        ${field('name', 'Name', s.name, 'text', 'required')}
        <div class="two">${field('check_in', 'Check in', s.check_in, 'date')}${field('check_out', 'Check out', s.check_out, 'date')}</div>
        ${field('address', 'Address (paste the local-language one for taxis)', s.address)}
        ${field('maps_url', 'Google Maps link', s.maps_url, 'url')}
        ${field('confirmation', 'Confirmation #', s.confirmation)}
        ${area('notes', 'Notes', s.notes)}
        <div class="sheet-foot"><span></span><button class="btn" onclick="saveStay('${id}')">Save</button></div>`);
}

function saveStay(id) {
    const f = formData();
    closeSheet();
    save('trip_stays', { id, name: f.name.trim(), check_in: f.check_in, check_out: f.check_out, address: f.address.trim(), maps_url: f.maps_url.trim(), confirmation: f.confirmation.trim(), notes: f.notes });
}

function editDay(date) {
    const d = S.days.find(x => x.date === date);
    openSheet(`
        <div class="sheet-head"><h2>${fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2><button type="button" class="link" onclick="closeSheet()">Cancel</button></div>
        ${field('title', 'Headline', d.title)}
        ${field('city', 'City', d.city)}
        ${area('notes', 'Notes for the day', d.notes)}
        <div class="sheet-foot"><span></span><button class="btn" onclick="saveDay('${date}')">Save</button></div>`);
}

function saveDay(date) {
    const f = formData();
    closeSheet();
    save('trip_days', { date, title: f.title.trim(), city: f.city.trim(), notes: f.notes }, 'date');
}

// Big, high-contrast address to hold up to a taxi driver.
function showAddress(id) {
    const s = S.stays.find(x => x.id === id);
    openSheet(`
        <div class="driver">
            <p class="driver-name">${esc(s.name)}</p>
            <p class="driver-addr">${esc(s.address)}</p>
            <div class="actions">
                <button type="button" class="btn ghost" onclick="copy(${esc(JSON.stringify(s.address))})">Copy</button>
                <button type="button" class="btn" onclick="closeSheet()">Done</button>
            </div>
        </div>`);
}

// ---------- start ----------

try { const c = JSON.parse(localStorage.getItem(CACHE)); if (c?.days) S = c; } catch {}
window.addEventListener('hashchange', () => { closeSheet(); render(); window.scrollTo(0, 0); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
setInterval(() => { if (!document.hidden && $('#sheet').hidden) refresh(); }, 60000);
render();
refresh();
