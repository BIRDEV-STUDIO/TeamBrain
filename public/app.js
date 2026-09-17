'use strict';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { teams: [], team: null, project: null, snapshot: null, view: 'overview', calendarCursor: new Date(), query: '', type: '', mode: null, version: 0 };
const names = {
  'note.created': 'Not',
  'issue.detected': 'Sorun',
  'decision.proposed': 'Karar önerisi',
  'decision.accepted': 'Kabul edilen karar',
  'change.recorded': 'Değişiklik',
  'impact.detected': 'Etki analizi',
  'session.summary.imported': 'Oturum özeti',
  'chat.message': 'Sohbet mesajı',
  'chat.reply.generated': 'Yerel yanıt'
};
const views = { overview: 'Genel bakış', chat: 'Sohbet', activity: 'Aktivite', decisions: 'Karar defteri', calendar: 'Takvim', tasks: 'Görevler', daily: 'Günün özeti', integrations: 'Bağlantılar' };
const date = value => new Date(value).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
const time = value => new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
const today = new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
$('date').textContent = today.toLocaleUpperCase('tr-TR');
const savedTheme = localStorage.getItem('teambrain-theme');
if (savedTheme === 'dark' || (!savedTheme && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark');
function updateThemeButton() { const dark=document.documentElement.classList.contains('dark'); $('theme-toggle').textContent=dark?'☀':'◐'; $('theme-toggle').setAttribute('aria-label',dark?'Açık moda geç':'Koyu moda geç'); }
updateThemeButton();
$('theme-toggle').addEventListener('click',()=>{const dark=document.documentElement.classList.toggle('dark'); localStorage.setItem('teambrain-theme',dark?'dark':'light'); updateThemeButton();});

async function api(url, data, method = 'POST') {
  const response = await fetch(url, data === undefined ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'İşlem tamamlanamadı.');
  return result;
}
let toastTimer;
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 5500);
}
function base() { return `/api/teams/${state.team}/projects/${state.project}`; }
function team() { return state.teams.find(t => t.id === state.team); }
function events() { return state.snapshot?.events || []; }
function chatEvents() { return events().filter(e => e.event_type === 'chat.message' || e.event_type === 'chat.reply.generated').reverse(); }

function choose() {
  $('team').innerHTML = state.teams.length ? state.teams.map(t => `<option value="${escape(t.id)}">${escape(t.name)}</option>`).join('') : '<option>Henüz ekip yok</option>';
  if (state.team) $('team').value = state.team;
  $('projects').innerHTML = (team()?.projects || []).map(p => `<button data-project="${escape(p.id)}" class="${p.id === state.project ? 'active' : ''}"><span class="project-dot"></span>${escape(p.name)}</button>`).join('');
  $('add-project').disabled = !state.team;
}
async function reloadTeams() {
  state.teams = await api('/api/teams');
  if (!team()) state.team = state.teams[0]?.id || null;
  if (!team()?.projects.some(p => p.id === state.project)) state.project = team()?.projects[0]?.id || null;
  choose();
  await loadProject();
}
async function loadProject() {
  const version = ++state.version;
  state.snapshot = null;
  render();
  if (!state.project) return;
  try {
    const result = await api(base());
    if (version !== state.version) return;
    state.snapshot = result;
    choose();
    render();
  } catch (error) {
    if (version === state.version) toast(error.message);
  }
}
function empty(title, text, action) {
  return `<div class="empty"><span class="empty-symbol">✳</span><h3>${title}</h3><p>${text}</p>${action ? `<button class="secondary" data-action="${action.id}">${action.text}</button>` : ''}</div>`;
}
function eventIcon(event) {
  if (event.event_type === 'issue.detected') return '!';
  if (event.event_type.startsWith('decision.')) return '◇';
  if (event.event_type.startsWith('chat.')) return '◌';
  return '≋';
}
function record(event) {
  const issue = event.event_type === 'issue.detected';
  const actor = event.actor_id || 'Bilinmeyen kullanıcı';
  return `<button class="record" data-event="${escape(event.event_id)}"><span class="record-icon ${issue ? 'issue' : ''}">${eventIcon(event)}</span><span class="record-main"><span class="record-title">${escape(event.title)}</span><span class="record-preview">${escape(event.body || 'Bağlamı görmek için kaydı aç.')}</span><span class="record-meta">Kullanıcı: ${escape(actor)} · ${escape(names[event.event_type] || event.event_type)}</span></span><time class="record-time" datetime="${escape(event.created_at)}"><span>${date(event.created_at)} · ${time(event.created_at)}</span></time></button>`;
}
function filtered() {
  return events().filter(e => (!state.query || `${e.title} ${e.body}`.toLocaleLowerCase('tr-TR').includes(state.query.toLocaleLowerCase('tr-TR'))) && (!state.type || e.event_type === state.type) && (state.view !== 'decisions' || e.event_type.startsWith('decision.')));
}
function renderList() {
  const target = $('results');
  if (target) target.innerHTML = filtered().map(record).join('') || empty('Burada henüz bir kayıt yok.', 'Aramanı değiştirebilir veya yeni bir kayıt ekleyebilirsin.');
}
function renderShell(data, decisions) {
  $('breadcrumb').textContent = `${team()?.name || 'Çalışma alanı'}${data ? ' / ' + data.project.name : ''}`;
  $('heading').textContent = state.view === 'overview' ? data?.project.name || 'Ekibinin ortak hafızası.' : views[state.view];
  $('subtitle').textContent = state.view === 'chat' ? 'Projenin hafızasıyla konuş; her mesaj aynı zamanda kayıt olur.' : state.view === 'overview' ? 'Kararlar, çalışmalar ve onları birbirine bağlayan nedenler.' : 'Seçili projenin bilgisi. İhtiyacın olan bağlam, bir arada.';
  $('profile').textContent = (data?.actor || 'Y').slice(0, 1).toUpperCase();
  $('profile').title = data?.actor || 'Yerel kullanıcı';
  $('new-event').disabled = !data;
  $('hero').hidden = state.view !== 'overview';
  $('hero-action').textContent = !state.team ? 'İlk ekibini oluştur ↗' : !state.project ? 'İlk projeni oluştur ↗' : 'Bir karar kaydet ↗';
  $('metrics').hidden = !data || state.view === 'integrations' || state.view === 'chat';
  $('metrics').innerHTML = [[data?.total || 0, 'Toplam kayıt', 'Projenin kalıcı hafızası', '≋'], [decisions.length, 'Karar kaydı', 'Gerekçesiyle birlikte', '◇'], [events().filter(e => e.event_type === 'issue.detected').length, 'Sorun kaydı', 'Açık/kapalı takibi henüz yok', '◌'], [new Set(events().map(e => e.actor_id)).size, 'Katkı veren', 'Kayıtlardaki farklı kişiler', '↗']].map(([n, label, hint, icon]) => `<div class="metric"><div class="metric-top"><span>${label}</span><span>${icon}</span></div><strong>${n}</strong><small>${hint}</small></div>`).join('');
  document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === state.view); b.setAttribute('aria-current', b.dataset.view === state.view ? 'page' : 'false'); });
}
function plannerEditor(mode) {
  state.mode = mode; $('form-error').textContent = '';
  $('editor-title').textContent = mode === 'calendar' ? 'Takvime etkinlik ekle' : 'Yeni görev oluştur';
  $('fields').innerHTML = mode === 'calendar' ? `<label>Etkinlik adı</label><input name="title" maxlength="200" required placeholder="Örn. Sprint planlama"><label>Tarih</label><input name="date" type="date" required><label>Saat</label><input name="time" type="time"><label>Konum veya bağlantı</label><input name="location" maxlength="200" placeholder="Örn. Toplantı odası / bağlantı"><label>Not</label><textarea name="notes" maxlength="2000" placeholder="Ekip için kısa not"></textarea>` : `<label>Görev</label><input name="title" maxlength="200" required placeholder="Örn. Test senaryolarını hazırla"><label>Sorumlu ekip üyesi</label><input name="assignee" maxlength="200" required placeholder="Örn. Emre"><label>Son tarih</label><input name="due_date" type="date"><label>Açıklama</label><textarea name="description" maxlength="2000" placeholder="Beklenen çıktı"></textarea>`;
  $('editor').showModal(); $('fields').querySelector('input')?.focus();
}
function renderCalendar() {
  const cursor = state.calendarCursor || new Date(), year = cursor.getFullYear(), month = cursor.getMonth();
  const monthName = new Date(year, month, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  const items = state.snapshot.planner?.calendar || [], byDate = items.reduce((map, item) => { (map[item.date.slice(0, 10)] ||= []).push(item); return map; }, {});
  const first = new Date(year, month, 1), offset = (first.getDay() + 6) % 7, days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - offset + 1, dateObj = new Date(year, month, dayNumber), current = dayNumber > 0 && dayNumber <= days;
    const key = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    const dayItems = byDate[key] || [], todayKey = new Date().toISOString().slice(0, 10);
    return `<div class="month-cell ${current ? '' : 'outside'} ${key === todayKey ? 'today' : ''} ${dayItems.length ? 'has-events' : ''}"><span class="cell-number">${dateObj.getDate()}</span>${dayItems.slice(0, 3).map((item, itemIndex) => `<div class="calendar-chip chip-${itemIndex % 4}" title="${escape(item.title)}">${item.time ? `<small>${escape(item.time)}</small>` : ''}${escape(item.title)}</div>`).join('')}${dayItems.length > 3 ? `<span class="more-events">+${dayItems.length - 3} etkinlik</span>` : ''}</div>`;
  }).join('');
  $('content').innerHTML = `<div class="calendar-heading"><div><span class="eyebrow">EKİP PLANI</span><h2>${escape(monthName.charAt(0).toLocaleUpperCase('tr-TR') + monthName.slice(1))}</h2><p>${items.length ? `${items.length} etkinlik planlandı` : 'Etkinlikleri günlere ekleyerek ekibin ritmini görünür kıl.'}</p></div><div class="calendar-actions"><button class="secondary" data-calendar-nav="prev" aria-label="Önceki ay">‹</button><button class="secondary today-button" data-calendar-nav="today">Bugün</button><button class="secondary" data-calendar-nav="next" aria-label="Sonraki ay">›</button><button class="primary" data-action="calendar">＋ Etkinlik ekle</button></div></div><section class="calendar-panel"><div class="weekdays">${['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(day => `<span>${day}</span>`).join('')}</div><div class="month-grid">${cells}</div></section><div class="calendar-legend"><span><i class="legend-dot chip-0"></i>Toplantı</span><span><i class="legend-dot chip-1"></i>Teslim</span><span><i class="legend-dot chip-2"></i>Çalışma</span><span><i class="legend-dot chip-3"></i>Diğer</span></div>`;
}function renderTasks() {
  const tasks = state.snapshot.planner?.tasks || [], done = tasks.filter(t => t.status === 'done').length;
  $('content').innerHTML = `<div class="planner-toolbar"><div><h2>Ekip görevleri</h2><p>${done}/${tasks.length} görev tamamlandı. Sorumlu kişi bitirdiğinde kutuyu işaretleyin.</p></div><button class="primary" data-action="task">＋ Görev ata</button></div><section class="panel planner-list">${tasks.map(task => `<article class="task-item ${task.status === 'done' ? 'done' : ''}"><button class="task-check" data-task="${escape(task.id)}" aria-label="${task.status === 'done' ? 'Tamamlandı olarak işaretini kaldır' : 'Görevi tamamlandı işaretle'}">${task.status === 'done' ? '✓' : ''}</button><div><h3>${escape(task.title)}</h3><p>Sorumlu: <strong>${escape(task.assignee)}</strong>${task.due_date ? ` · Son tarih: ${escape(task.due_date)}` : ''}</p>${task.description ? `<small>${escape(task.description)}</small>` : ''}${task.completed_by ? `<small class="task-completed">Tamamlayan: ${escape(task.completed_by)}</small>` : ''}</div></article>`).join('') || empty('Henüz görev yok.', 'Ekip üyelerine görev atayarak başlayın.', {id:'task',text:'＋ İlk görevi ata'})}</section>`;
}
function render() {
  const data = state.snapshot;
  const decisions = events().filter(e => e.event_type.startsWith('decision.'));
  renderShell(data, decisions);
  if (!state.project) {
    $('content').innerHTML = `<section class="panel">${empty(state.team ? 'Bu ekibin ilk projesini ekle.' : 'Ortak beyni bağla ve ekibini başlat.', state.team ? 'Her projenin kayıtları ayrı tutulur.' : 'Önce Bağlantılar sekmesinde GitHub memory repo durumunu kontrol et. Sonra ekip ve proje oluştur. Üyeler aynı memory repo’yu kendi actor kimlikleriyle kullanır.', { id: state.team ? 'project' : 'team', text: state.team ? '＋ Proje oluştur' : '＋ Ekip oluştur' })}</section>`;
    return;
  }
  if (!data) { $('content').innerHTML = '<div class="panel empty" role="status">Proje yükleniyor…</div>'; return; }
  if (state.view === 'overview') renderOverview(decisions);
  else if (state.view === 'chat') renderChat();
  else if (['activity', 'decisions'].includes(state.view)) renderActivity();
  else if (state.view === 'calendar') renderCalendar();
  else if (state.view === 'tasks') renderTasks();
  else if (state.view === 'daily') renderDaily();
  else renderConnections();
}
function renderOverview(decisions) {
  $('content').innerHTML = `<div class="content-grid"><section class="panel"><div class="panel-head"><h2>Son hareketler</h2><button class="text-button" data-action="activity">Tümünü gör ↗</button></div><div class="feed">${events().filter(e => !e.event_type.startsWith('chat.')).slice(0, 5).map(record).join('') || empty('İlk kaydınla hikâye başlasın.', 'Bir gelişme, fikir veya karar ekle.', { id: 'event', text: 'Yeni kayıt' })}</div></section><section class="panel"><div class="panel-head"><h2>Karar defteri</h2><span>◇</span></div>${decisions.slice(0, 3).map(e => `<button class="decision-card" data-event="${escape(e.event_id)}"><span class="badge">${escape(names[e.event_type] || 'Karar')}</span><h3>${escape(e.title)}</h3><span class="record-meta">${date(e.created_at)} · Gerekçeyi aç ↗</span></button>`).join('') || empty('Nedenini de hatırla.', 'Aldığınız kararları gerekçesiyle kaydedin.')}</section></div><div class="link-status">◉ &nbsp; Kayıtlar bu bilgisayarda saklanıyor. Sohbet dahil tüm proje hafızası yerel event olarak tutulur.</div>`;
}
function renderChat() {
  const messages = chatEvents();
  const github = state.snapshot.connection?.github;
  const sharing = github?.connected ? (github.sync === 'background' ? 'otomatik olarak GitHub memory reposuna paylaşılır' : 'GitHub memory reposuna manuel senkronlanır') : 'GitHub bağlantısı kurulmadı';
  $('content').innerHTML = `<section class="chat-panel"><div class="chat-history" id="chat-history"><div class="panel-head chat-context"><strong>Seçili proje sohbeti</strong><small>${escape(sharing)} · Mesajlar yalnızca bu projenin hafızasında tutulur.</small></div>${messages.map(chatBubble).join('') || empty('Bu projede sohbet yok.', 'Bir soru sor veya ekip arkadaşlarına mesaj bırak. Mesajlar proje hafızasına kaydedilir.')}</div><form id="chat-form" class="chat-composer"><label class="sr-only" for="chat-message">Mesaj</label><textarea id="chat-message" name="message" maxlength="50000" placeholder="Ekip arkadaşlarına mesaj yaz…"></textarea><button class="primary" id="send-chat">Gönder</button></form></section><div class="link-status">Mesajlar GitHub senkronizasyonuyla ekipçe paylaşılır. Her mesaj seçili projeye, gönderen kişinin TeamBrain kimliğiyle kaydedilir. ${escape(sharing)}.</div>`;
  const history = $('chat-history');
  history.scrollTop = history.scrollHeight;
  $('chat-form').addEventListener('submit', submitChat);
}
function chatBubble(event) {
  const reply = event.event_type === 'chat.reply.generated';
  return `<button class="chat-bubble ${reply ? 'assistant' : 'user'}" data-event="${escape(event.event_id)}"><span class="chat-role">${reply ? 'TeamBrain' : `Gönderen · ${escape(event.actor_id || 'Bilinmeyen kullanıcı')}`}</span><span class="chat-text">${escape(event.body)}</span><time>${date(event.created_at)} · ${time(event.created_at)}</time></button>`;
}
async function submitChat(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = new FormData(form).get('message');
  if (!String(message || '').trim()) return;
  $('send-chat').disabled = true;
  try {
    await api(base() + '/chat', { message });
    form.reset();
    await loadProject();
  } catch (error) {
    toast(error.message);
  } finally {
    $('send-chat')?.removeAttribute('disabled');
  }
}
function renderActivity() {
  $('content').innerHTML = `<div class="toolbar"><label class="sr-only" for="search">Kayıtlarda ara</label><input id="search" type="search" value="${escape(state.query)}" placeholder="Başlık veya açıklamada ara…"><label class="sr-only" for="filter">Kayıt türü</label><select id="filter"><option value="">Tüm türler</option>${Object.entries(names).map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select><button class="secondary" data-action="refresh">Yenile</button></div><section class="panel"><div class="feed" id="results"></div></section><p class="detail-meta">En yeni ${events().length} / ${state.snapshot.total} kayıt gösteriliyor.</p>`;
  $('filter').value = state.type;
  $('search').addEventListener('input', e => { state.query = e.target.value; renderList(); });
  $('filter').addEventListener('change', e => { state.type = e.target.value; renderList(); });
  renderList();
}
function renderDaily() {
  const todays = events().filter(e => new Date(e.created_at).toDateString() === new Date().toDateString() && !e.event_type.startsWith('chat.'));
  $('content').innerHTML = `<section class="panel"><div class="panel-head"><h2>${today}</h2><span class="badge">KAYITLARDAN TÜRETİLDİ</span></div><div class="feed">${todays.map(record).join('') || empty('Bugün henüz kayıt yok.', 'Yeni kayıtlar günün özetinde otomatik görünür.')}</div></section><div class="link-status">Bu görünüm bir AI özeti değil; bugünkü kayıtların derlemesidir. Asıl kayıtları değiştirmez.</div>`;
}
function renderConnections() {
  $('content').innerHTML = `<div class="connections">${[['Git paylaşımı', 'Manuel CLI', 'Ekip paylaşımı için projeye özel bir memory deposu gerekir. Otomatik senkronizasyon ve arayüzden remote kurulumu henüz uygulanmadı.'], ['Chat sağlayıcıları', 'Yerel motor aktif', 'Codex, Claude veya Ollama adapterları aynı chat kontratına bağlanacak şekilde ayrıldı.'], ['Serena', 'Bağlı değil', 'Sembol ve kod etkisi analizleri için planlanan bağlantı. Mevcut adapter yalnızca verilen analiz verisini dönüştürür.'], ['Obsidian', 'Markdown uyumlu', 'Projenin memory klasöründeki kayıtlar okunabilir. Özel Obsidian eklentisi henüz bulunmuyor.']].map(([name, status, text]) => `<section class="panel connection"><h3>${name}</h3><span class="badge">${status}</span><p>${text}</p></section>`).join('')}</div><div class="link-status">Arama indeksini kayıtlardan yeniden kurabilirsin. <button class="secondary" data-action="reindex">İndeksi yenile</button></div>`;
}
function editor(mode) {
  if (mode === 'project' && !state.team) mode = 'team';
  state.mode = mode;
  $('form-error').textContent = '';
  $('editor-title').textContent = { team: 'Yeni bir ekip oluştur', project: 'Ekibine bir proje ekle', event: 'Birlikte hatırlanacak bir kayıt' }[mode];
  $('fields').innerHTML = mode === 'event' ? `<label for="event-type">Kayıt türü</label><select id="event-type" name="event_type">${Object.entries(names).filter(([v]) => !v.startsWith('chat.')).slice(0, 7).map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select><label for="event-title">Başlık</label><input id="event-title" name="title" maxlength="200" required placeholder="Örn. İletişim için CAN bus seçildi"><label for="event-body">Ne oldu, neden önemli?</label><textarea id="event-body" name="body" maxlength="50000" placeholder="Gerekçeyi ve değerlendirdiğiniz alternatifleri ekleyin."></textarea><label for="cause">Hangi kayda dayanıyor?</label><select id="cause" name="causation_id"><option value="">Bağımsız kayıt</option>${events().filter(e => !e.event_type.startsWith('chat.')).map(e => `<option value="${escape(e.event_id)}">${escape(e.title)}</option>`).join('')}</select>` : `<label for="entity-name">${mode === 'team' ? 'Ekip' : 'Proje'} adı</label><input id="entity-name" name="name" maxlength="100" required placeholder="${mode === 'team' ? 'Örn. BIRDEV Studio' : 'Örn. Robot kontrol sistemi'}"><p class="detail-meta">${mode === 'team' ? 'Sonraki adımda ekibine proje ekleyebilirsin.' : 'Bu proje seçili ekibe ait olacak ve ayrı bir kayıt geçmişi tutacak.'}</p>`;
  $('editor').showModal();
  $('fields').querySelector('input, textarea')?.focus();
}
async function detail(eventId) {
  const event = events().find(e => e.event_id === eventId);
  if (!event) return;
  $('detail-content').innerHTML = `<span class="badge">${escape(names[event.event_type] || event.event_type)}</span><h2>${escape(event.title)}</h2><p class="detail-meta">${escape(event.actor_id)} · ${date(event.created_at)}</p><div class="detail-body">${escape(event.body || 'Açıklama eklenmemiş.')}</div><h3>Kararın izleri</h3><div id="chain">Yükleniyor…</div><p class="detail-meta">Kayıt kimliği: ${escape(event.event_id)}</p>`;
  $('detail').showModal();
  try {
    const chain = await api(base() + '/chain?event=' + encodeURIComponent(eventId));
    $('chain').innerHTML = chain.map(e => `<div class="chain-item">${escape(e.title)}<small>${escape(names[e.event_type] || e.event_type)} · ${date(e.created_at)}</small></div>`).join('');
  } catch (error) {
    $('chain').textContent = error.message;
  }
}
$('team').addEventListener('change', async e => { state.team = e.target.value; state.project = team()?.projects[0]?.id || null; state.query = ''; choose(); await loadProject(); });
$('projects').addEventListener('click', async e => { const b = e.target.closest('[data-project]'); if (b) { state.project = b.dataset.project; state.query = ''; state.type = ''; choose(); await loadProject(); } });
$('nav').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) { state.view = b.dataset.view; state.query = ''; state.type = ''; render(); } });
$('content').addEventListener('click', async e => {  const calendarNav = e.target.closest('[data-calendar-nav]')?.dataset.calendarNav;
  if (calendarNav) { const cursor = state.calendarCursor || new Date(); if (calendarNav === 'today') state.calendarCursor = new Date(); else state.calendarCursor = new Date(cursor.getFullYear(), cursor.getMonth() + (calendarNav === 'next' ? 1 : -1), 1); render(); return; }
  const event = e.target.closest('[data-event]');
  if (event) { await detail(event.dataset.event); return; }
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (['team', 'project', 'event'].includes(action)) editor(action);
  if (action === 'calendar' || action === 'task') plannerEditor(action);
  if (action === 'activity') { state.view = 'activity'; render(); }
  if (action === 'refresh') await loadProject();
  const taskButton = e.target.closest('[data-task]');
  if (taskButton) { try { await api(base() + '/tasks/' + encodeURIComponent(taskButton.dataset.task), { status: taskButton.closest('.task-item').classList.contains('done') ? 'open' : 'done' }, 'PATCH'); await loadProject(); } catch (error) { toast(error.message); } return; }
  if (action === 'reindex') { try { const result = await api(base() + '/reindex', {}); toast(`${result.indexed} kayıt indekslendi.`); await loadProject(); } catch (error) { toast(error.message); } }
});
$('add-team').onclick = () => editor('team');
$('add-project').onclick = () => editor('project');
$('new-event').onclick = () => editor('event');
$('hero-action').onclick = () => editor(!state.team ? 'team' : !state.project ? 'project' : 'event');
$('close-editor').onclick = $('cancel').onclick = () => $('editor').close();
$('close-detail').onclick = () => $('detail').close();
$('editor-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('save').disabled = true;
  $('form-error').textContent = '';
  const input = Object.fromEntries(new FormData(e.target));
  try {
    if (state.mode === 'team') { const result = await api('/api/teams', input); state.team = result.id; state.project = null; }
    else if (state.mode === 'project') { const result = await api(`/api/teams/${state.team}/projects`, input); state.project = result.id; }
    else if (state.mode === 'calendar') await api(base() + '/calendar', input);
    else if (state.mode === 'task') await api(base() + '/tasks', input);
    else await api(base() + '/events', input);
    $('editor').close();
    toast('Kaydedildi.');
    await reloadTeams();
  } catch (error) {
    $('form-error').textContent = error.message;
  } finally {
    $('save').disabled = false;
  }
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); state.view = 'activity'; render(); $('search')?.focus(); }
});
reloadTeams().catch(error => { $('content').textContent = 'Bağlantı kurulamadı: ' + error.message; toast(error.message); });

// The connection view reflects the selected memory repository instead of a hard-coded preview state.
function renderConnections() {
  const c = state.snapshot?.connection || {};
  const github = c.github?.connected ? `Bağlı · ${escape(c.github.actor_id || 'kimlik yok')}` : 'Bağlı değil';
  const serena = c.serena?.configured ? 'Proje yapılandırması bulundu' : 'Yerel kod projesinde etkinleştirilmeli';
  const cards = [
    ['Git paylaşımı', github, c.github?.connected ? `Remote: ${escape(c.github.remote || '')}. Pull/push işlemleri açık ve bilinçlidir.` : 'Memory reposunu SETUP.md veya connect github komutuyla bağla.'],
    ['Chat sağlayıcıları', 'Yerel motor aktif', 'Sohbet yerel TeamBrain kayıtlarını arar; harici AI sağlayıcısı otomatik çağrılmaz.'],
    ['Serena', serena, 'Serena yalnızca kod sembolleri ve güvenli refactor içindir; ekip hafızasının sahibi değildir.'],
    ['AvenoxBeyin', 'Özel / manuel aktarım', 'Kişisel vault otomatik okunmaz. Yalnızca gizlilikten geçirilmiş özet aktarılır.'],
    ['Obsidian', 'Markdown uyumlu', 'Bu memory reposunu Obsidian ile açabilirsin; SQLite ve generated görünümler paylaşılmaz.']
  ];
  $('content').innerHTML = `<div class="connections">${cards.map(([name,status,text]) => `<section class="panel connection"><h3>${name}</h3><span class="badge">${status}</span><p>${text}</p></section>`).join('')}</div><div class="link-status">Bağlantı değiştiyse TeamBrain’i yeniden başlat. <button class="secondary" data-action="reindex">İndeksi yenile</button></div>`;
}
