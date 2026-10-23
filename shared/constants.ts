export const APP_NAME = 'Couchdrive';

/** Same ports every launch, so a paired phone's bookmark keeps working (PRD D7). */
export const DEFAULT_PORT = 8642;
export const DEFAULT_HTTPS_PORT = 8643;

/** If the default port is busy, try this many ports after it before giving up. */
export const PORT_ATTEMPTS = 20;

/** Query parameter that carries the pairing token in the QR code URL. */
export const TOKEN_PARAM = 't';
