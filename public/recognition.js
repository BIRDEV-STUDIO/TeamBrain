'use strict';
(function (global) {
  const phrases = ['Bugün küçük bir adım, yarın büyük bir kolaylık.', 'Paylaştığın bilgi, bir ekip arkadaşının önünü açabilir.', 'Güzel işler, birbirimizi dinleyerek başlar.', 'Her şeyi bugün bitirmek zorunda değilsin. Bir sonraki adım yeter.', 'Birlikte düşünmek de üretmenin bir parçası.', 'Özenle yapılan küçük işler birikir.', 'İyi bir soru, yeni bir çözümün başlangıcıdır.'];
  function greeting(now = new Date()) {
    const hour = now.getHours();
    return { title: hour < 6 ? 'İyi geceler ekip! 🌙' : hour < 12 ? 'Günaydın ekip! ☕💻' : hour < 18 ? 'Merhaba ekip! 👋💻' : 'İyi akşamlar ekip.', message: hour < 6 ? 'Dinlenmek de yolculuğun bir parçası. Kendine iyi bak.' : phrases[Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000) % phrases.length] };
  }
  if (typeof module !== 'undefined') { module.exports = { greeting }; return; }
  let requestVersion = 0, current = null;
  const disabledGreeting = () => { try { return localStorage.getItem('teambrain-greetings') === 'off'; } catch { return false; } };
  function welcome() {
    const banner = document.getElementById('welcome');
    banner.hidden = state.view !== 'overview' || disabledGreeting();
    const text = greeting();
    banner.querySelector('h2').textContent = text.title;
    banner.querySelector('p').textContent = text.message;
  }
  function settings() { return `<label class="recognition-setting"><span>Günün selamı<small>Kısa bir selam, küçük bir motivasyon.</small></span><input id="greeting-setting" type="checkbox" ${disabledGreeting() ? '' : 'checked'}></label>`; }
  function bindSettings() {
    $('greeting-setting').onchange = e => { try { localStorage.setItem('teambrain-greetings', e.target.checked ? 'on' : 'off'); } catch {} welcome(); };
  }
  function sourceButton(id, title) { return `<button type="button" class="text-button" data-rec-source="${escape(id)}">${escape(title)} ↗</button>`; }
  function showSource(id) {
    const source = current?.candidates.find(s => s.id === id);
    if (!source) return;
    $('recognition-source-title').textContent = source.title;
    $('recognition-source-body').textContent = `@${source.actor}\n\n${source.body || 'Açıklama eklenmemiş.'}\n\nKaynak: ${source.id}`;
    $('recognition-source').showModal();
  }
  function draw(data) {
    current = data;
    const profile = data.profiles.find(p => p.actor.toLowerCase() === data.actor.toLowerCase());
    const next = profile.badges.find(b => !b.earned_at);
    $('content').innerHTML = `<div class="profile-page"><section class="profile-hero"><div class="profile-identity"><span class="profile-monogram" aria-hidden="true">${escape(data.actor.slice(0, 1).toUpperCase())}</span><div><span class="eyebrow">YEREL PROFİL</span><h2>@${escape(data.actor)}</h2><p>${escape(state.snapshot?.project.name || 'Seçili proje')} içindeki katkıların</p></div></div><div class="profile-hero-copy"><span class="section-index">01</span><p>Her iyi katkı görünür bir iz bırakır.<br>İlerlemen burada, sade ve anlaşılır.</p></div></section>
      <section class="profile-dashboard"><div class="profile-stats"><div class="recognition-score"><span>KATKI PUANI</span><strong>${profile.points}</strong><small>Seçili proje</small></div><div><span>KAZANILAN ROZET</span><strong>${profile.badges.filter(b => b.earned_at).length}<em>/${profile.badges.length}</em></strong><small>Küçük adımlar, kalıcı izler</small></div></div>${next ? `<div class="recognition-next"><span class="eyebrow">SIRADAKİ ROZET</span><div><strong>${next.icon} ${escape(next.name)}</strong><span>${next.progress}/${next.target}</span></div><p>${escape(next.description)}</p><progress max="${next.target}" value="${next.progress}" aria-label="${escape(next.name)} ilerlemesi"></progress></div>` : '<div class="recognition-next complete"><strong>Tüm rozetler senin! 🚀</strong><p>Bu projede harika bir iz bıraktın.</p></div>'}</section>
      <section class="profile-badges"><div class="profile-section-title"><div><span class="section-index coral">02</span><h2>Rozetlerin</h2></div><p>Başarılarını ve sıradaki adımlarını tek bakışta gör.</p></div><div class="recognition-badges">${profile.badges.map((b, index) => `<details class="recognition-badge ${b.earned_at ? 'earned' : ''}"><summary><span class="badge-number">0${index + 1}</span><span class="recognition-icon" aria-hidden="true">${b.icon}</span><span class="badge-copy"><strong>${escape(b.name)}</strong><small>${escape(b.description)}</small></span><span class="badge-progress">${b.earned_at ? 'KAZANILDI' : `${b.progress}/${b.target}`}</span><span class="badge-state" aria-hidden="true">${b.earned_at ? '✓' : '＋'}</span></summary><div class="badge-description">${b.earned_at ? `<p>${date(b.earned_at)} tarihinde kazanıldı.</p>${b.sources.map(id => sourceButton(id, data.candidates.find(s => s.id === id)?.title || id)).join('')}` : '<p>İlerledikçe bu rozet otomatik olarak açılır.</p>'}</div></details>`).join('')}</div></section>
      <section class="profile-bottom"><div class="profile-history"><div class="profile-section-title compact"><div><span class="section-index blue">03</span><h2>Puan geçmişi</h2></div><span>${profile.history.length} kayıt</span></div><div class="recognition-history">${profile.history.length ? profile.history.map(h => `<article><span class="recognition-points">+${h.points}</span><strong>${escape(h.message)}</strong><p>${date(h.created_at)}</p>${sourceButton(h.source_id, h.title)}</article>`).join('') : '<p class="profile-empty">Henüz puan kaydı yok.</p>'}</div></div><aside class="profile-preferences"><span class="eyebrow">DENEYİM</span><h2>Sana göre.</h2>${settings()}<p class="profile-footnote">Puanlar ve rozetler seçili projedeki mevcut onaylı kayıtlardan hesaplanır.</p></aside></section></div>`;
    bindSettings();
    $('content').querySelectorAll('[data-rec-source]').forEach(b => b.onclick = () => showSource(b.dataset.recSource));
  }
  async function openProfile() {
    state.view = 'profile';
    window.scrollTo({ top: 0, behavior: 'instant' });
    render();
  }
  async function renderProfile() {
    const version = ++requestVersion, endpoint = state.project ? base() + '/recognition' : null;
    if (!endpoint) { $('content').innerHTML = `<section class="profile-page profile-empty"><h2>@${escape(state.actors[0] || 'Yerel kullanıcı')}</h2><p>Puanlarını ve rozetlerini görmek için bir proje seç.</p>${settings()}</section>`; bindSettings(); return; }
    $('content').innerHTML = '<section class="profile-page profile-loading" role="status">Profilin yükleniyor…</section>';
    try { const data = await api(endpoint); if (version === requestVersion && state.view === 'profile' && endpoint === base() + '/recognition') draw(data); }
    catch (error) { if (version === requestVersion && state.view === 'profile') { $('content').innerHTML = `<section class="profile-page profile-empty"><p role="alert">${escape(error.message)}</p><button id="recognition-retry" class="secondary">Tekrar dene</button></section>`; $('recognition-retry').onclick = renderProfile; } }
  }
  global.TeamBrainRecognition = { greeting, welcome, openProfile, renderProfile };
})(typeof window === 'undefined' ? globalThis : window);
