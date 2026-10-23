// Milestone 1 phone test page. Milestone 3 replaces it with the real phone app.
import { TOKEN_PARAM } from '../../shared/constants';
import { formatBytes } from '../../shared/format';
import type { SpikeDownload, SpikeInfo } from '../../shared/types';

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

/** Sharing loads the whole file into the phone's memory first, so very big files are left out. */
const MAX_SHARE_BYTES = 200 * 1024 * 1024;
/** Chrome offers file sharing only on pages it treats as secure: the padlock link, not the simple one. */
const canShareFiles = typeof navigator.canShare === 'function';

function renderDownloads(info: SpikeInfo): void {
  if (!canShareFiles) {
    const notice = $('share-notice');
    notice.hidden = false;
    notice.textContent =
      location.protocol === 'https:'
        ? "Chrome doesn't offer sharing on this page, even on the padlock link."
        : 'Share buttons need the padlock link. On the laptop, pick "Padlock link (HTTPS)" and scan the new QR code.';
  }

  const list = $('downloads');
  for (const file of info.downloads) {
    const details = document.createElement('div');
    details.className = 'details';
    details.append(span('label', file.label), span('name', `${file.name} · ${formatBytes(file.size)}`));
    if (file.note) details.append(span('note', file.note));

    const download = element('a', 'Download');
    download.className = 'button';
    download.href = withToken(`/spike/download/${file.id}`);
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(download);

    const status = span('share-status', '');
    if (canShareFiles) {
      const share = element('button', 'Share');
      share.type = 'button';
      share.className = 'button';
      if (file.size > MAX_SHARE_BYTES) {
        share.disabled = true;
        status.textContent = 'Too big to share from the browser. Download it, then share from the notification.';
      } else {
        share.addEventListener('click', () => void shareFile(file, share, status));
      }
      actions.append(share);
    }

    const item = document.createElement('li');
    item.className = 'file';
    item.append(details, actions, status);
    list.append(item);
  }
}

/** Files loaded on a first tap whose share sheet Chrome refused because loading took too long. */
const prepared = new Map<string, File>();

async function shareFile(file: SpikeDownload, button: HTMLButtonElement, status: HTMLElement): Promise<void> {
  const reset = () => {
    button.disabled = false;
    button.textContent = 'Share';
  };
  let shareable = prepared.get(file.id);
  if (!shareable) {
    button.disabled = true;
    button.textContent = 'Loading…';
    status.textContent = '';
    try {
      const response = await fetch(withToken(`/spike/download/${file.id}`));
      if (!response.ok) throw new Error(`the laptop answered ${response.status}`);
      const blob = await response.blob();
      shareable = new File([blob], file.name, { type: blob.type });
    } catch (err) {
      status.textContent = `Couldn't load the file: ${(err as Error).message}`;
      return reset();
    }
  }

  if (!navigator.canShare({ files: [shareable] })) {
    status.textContent = `Chrome can't share .${file.name.split('.').pop()} files.`;
    return reset();
  }
  try {
    await navigator.share({ files: [shareable] });
    prepared.delete(file.id);
    status.textContent = 'Shared.';
  } catch (err) {
    const name = (err as Error).name;
    if (name === 'NotAllowedError') {
      // Chrome only opens the share sheet right after a tap; a slow load used that up.
      prepared.set(file.id, shareable);
      button.disabled = false;
      button.textContent = 'Tap again to share';
      return;
    }
    prepared.delete(file.id);
    status.textContent = name === 'AbortError' ? 'Share cancelled.' : `Share failed (${name}).`;
  }
  reset();
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
    ['Link', location.protocol === 'https:' ? 'Padlock (HTTPS)' : 'Simple (HTTP)'],
    ['Chrome treats the page as secure', window.isSecureContext ? 'yes' : 'no'],
    ['Share files', canShareFiles ? 'available' : 'not available'],
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
