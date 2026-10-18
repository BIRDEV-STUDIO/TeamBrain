const menu = document.querySelector('#menu');
const nav = document.querySelector('#nav');
const language = document.querySelector('#language');
const copyButton = document.querySelector('#copy-command');
const command = document.querySelector('#command');

menu.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(open));
});

nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
}));

function applyLanguage(nextLanguage) {
  const english = nextLanguage === 'en';
  document.documentElement.lang = english ? 'en' : 'tr';
  document.title = english ? 'TeamBrain — The memory layer for your team' : 'TeamBrain — Takım çalışmasının hafıza katmanı';
  document.querySelectorAll('[data-tr][data-en]').forEach((element) => {
    element.innerHTML = english ? element.dataset.en : element.dataset.tr;
  });
  language.textContent = english ? 'TR' : 'EN';
  language.setAttribute('aria-label', english ? 'Türkçeye geç' : 'Switch to English');
  localStorage.setItem('teambrain-language', english ? 'en' : 'tr');
}

language.addEventListener('click', () => applyLanguage(document.documentElement.lang === 'en' ? 'tr' : 'en'));

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(command.textContent.trim());
    const original = copyButton.textContent;
    copyButton.textContent = document.documentElement.lang === 'en' ? 'COPIED' : 'KOPYALANDI';
    window.setTimeout(() => { copyButton.textContent = original; }, 1600);
  } catch {
    window.getSelection()?.selectAllChildren(command);
  }
});

applyLanguage(localStorage.getItem('teambrain-language') || 'tr');
