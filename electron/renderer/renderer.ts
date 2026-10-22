import { formatBytes } from '../../shared/format';
import type { CouchdriveApi, ShareState } from '../../shared/types';

declare global {
  interface Window {
    couchdrive: CouchdriveApi;
  }
}

const api = window.couchdrive;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function render(state: ShareState): void {
  const running = state.status === 'running';
  $('sharing').hidden = !running;
  $('message').hidden = running;

  if (running) {
    $('network').textContent = `Sharing on ${state.interfaceName} (${state.host})`;
    $<HTMLImageElement>('qr').src = state.qrDataUrl ?? '';
    $('url').textContent = state.url ?? '';
    $('port').textContent =
      state.port === state.defaultPort
        ? `Port ${state.port}`
        : `Port ${state.port}: the usual port ${state.defaultPort} was busy, so this session uses the next free one.`;
  } else {
    const [title, text] = messageFor(state);
    $('message-title').textContent = title;
    $('message-text').textContent = text;
  }

  const { name, size, isSample } = state.video;
  $('video-name').textContent = `${name} · ${formatBytes(size)}${isSample ? ' (built-in 6-second sample)' : ''}`;

  const others = state.otherAddresses.map((a) => `${a.interfaceName} ${a.address}`).join(', ');
  $('others').hidden = !others;
  $('others').textContent = `Other addresses on this laptop: ${others}`;
}

function messageFor(state: ShareState): [string, string] {
  switch (state.status) {
    case 'no-network':
      return [
        'No WiFi connection',
        "Connect this laptop to your WiFi or your phone's hotspot, then press Restart sharing.",
      ];
    case 'error':
      return ["Couldn't start sharing", `${state.error ?? 'Unknown error'}. Press Restart sharing to try again.`];
    default:
      return ['Starting…', 'Finding your WiFi address.'];
  }
}

$('copy').addEventListener('click', async () => {
  await api.copyUrl();
  $('copy').textContent = 'Copied';
  setTimeout(() => ($('copy').textContent = 'Copy'), 1500);
});
$('choose-video').addEventListener('click', () => void api.chooseVideo());
$('restart').addEventListener('click', () => void api.restartSharing());

api.onState(render);
void api.getState().then(render);
