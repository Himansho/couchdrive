// Milestone 1 phone test page. Milestone 3 replaces it with the real phone app.
import { TOKEN_PARAM } from '../../shared/constants';
import { formatBytes } from '../../shared/format';
import type { SpikeInfo } from '../../shared/types';

const token = new URLSearchParams(location.search).get(TOKEN_PARAM) ?? '';
const withToken = (path: string) => `${path}${path.includes('?') ? '&' : '?'}${TOKEN_PARAM}=${encodeURIComponent(token)}`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

async function main(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(withToken('/spike/info'));
  } catch {
    return showStatus("Can't reach the laptop. Check that Couchdrive is still sharing, then reload.", 'error');
  }
  if (response.status === 403) return showStatus('This link has expired. Scan the QR code on your laptop.', 'error');
  if (!response.ok) return showStatus(`The laptop answered with an error (${response.status}). Reload to try again.`, 'error');

  const info: SpikeInfo = await response.json();
  showStatus('Connected to your laptop', 'ok');
  $('content').hidden = false;
  setUpVideo(info);
  renderDownloads(info);
  renderAbout();
}

function showStatus(text: string, kind: 'ok' | 'error'): void {
  const status = $('status');
  status.textContent = text;
  status.className = `status ${kind}`;
}

function setUpVideo(info: SpikeInfo): void {
  const video = $<HTMLVideoElement>('video');
  video.src = withToken(`/spike/video?v=${encodeURIComponent(info.video.version)}`);
  $('video-meta').textContent = `${info.video.name} · ${formatBytes(info.video.size)}`;

  // Time from tapping play to the first moving frame, and from each seek to the new frame.
  let playTappedAt = 0;
  let seekStartedAt = 0;
  video.addEventListener('play', () => {
    if (!playTappedAt) playTappedAt = performance.now();
  });
  video.addEventListener('playing', () => {
    if (playTappedAt > 0) {
      $('t-start').textContent = seconds(performance.now() - playTappedAt);
      playTappedAt = -1;
    }
  });
  video.addEventListener('seeking', () => {
    seekStartedAt = performance.now();
  });
  video.addEventListener('seeked', () => {
    $('t-seek').textContent = `${seconds(performance.now() - seekStartedAt)} (to ${clock(video.currentTime)})`;
  });
  video.addEventListener('error', () => {
    $('video-meta').textContent += " · Chrome can't play this file";
  });

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-jump]')) {
    button.addEventListener('click', () => {
      if (!Number.isFinite(video.duration)) return;
      video.currentTime = video.duration * Number(button.dataset.jump);
      if (video.paused) void video.play();
    });
  }
}

function renderDownloads(info: SpikeInfo): void {
  const list = $('downloads');
  for (const file of info.downloads) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = withToken(`/spike/download/${file.id}`);
    link.className = 'download';
    link.append(span('label', file.label), span('name', `${file.name} · ${formatBytes(file.size)}`));
    if (file.note) link.append(span('note', file.note));
    item.append(link);
    list.append(item);
  }
}

function renderAbout(): void {
  // A QR scan can open the page inside the Google app, whose downloads behave differently.
  const ua = navigator.userAgent;
  const chrome = ua.match(/Chrome\/([\d.]+)/)?.[1];
  const browser = /GSA\//.test(ua)
    ? 'Google app: open this page in Chrome'
    : /; wv\)/.test(ua)
      ? 'In-app browser: open this page in Chrome'
      : chrome
        ? `Chrome ${chrome}`
        : 'Not Chrome';
  const rows: [string, string][] = [
    ['Browser', browser],
    ['Address', location.host],
    ['Chrome treats the page as secure', window.isSecureContext ? 'yes' : 'no (plain HTTP)'],
    ['Share menu (navigator.share)', 'share' in navigator ? 'available' : 'not available'],
  ];
  $('about').append(...rows.flatMap(([term, value]) => [element('dt', term), element('dd', value)]));
}

function span(className: string, text: string): HTMLSpanElement {
  const el = element('span', text);
  el.className = className;
  return el;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

void main();
