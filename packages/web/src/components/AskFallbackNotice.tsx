import type { ReactElement } from 'react';
import type { AskFailure } from '../pages/useAsk';
import type { UnknownReason } from '../services/api-client';

/** Props of {@link AskFallbackNotice}: an `UNKNOWN` with its reason, or a failure. */
export type AskFallbackNoticeProps = { reason: UnknownReason; failure?: never } | { failure: AskFailure; reason?: never };

/**
 * The provisional notice for what is not an answer, until DIS-66 replaces it with the final states
 * (ask-page, "Provisional notice for what is not an answer"; DIS-65 design D10, D25). An `UNKNOWN` is a
 * status «Sin respuesta verificada (motivo: <reason>).» in the muted colours; a failure is an alert in the
 * warning colours, «No se ha podido obtener la respuesta.» followed by the API's error code or «La API de
 * CODEMIND no responde.». It offers no retry button: sending the question again asks again.
 *
 * @param props - The reason of the `UNKNOWN`, or the failure.
 * @returns The status or the alert.
 */
export function AskFallbackNotice(props: AskFallbackNoticeProps): ReactElement {
  if (props.failure === undefined) {
    return (
      <p role="status" className="mt-6 rounded-card bg-canvas px-4 py-3 text-sm text-ink-muted">
        {`Sin respuesta verificada (motivo: ${props.reason}).`}
      </p>
    );
  }
  const { failure } = props;
  return (
    <div
      role="alert"
      className="mt-6 flex gap-3 rounded-card border border-warning-border bg-warning-soft px-4 py-3 text-sm text-warning-ink"
    >
      <span aria-hidden="true">⚠</span>
      <div>
        <p>No se ha podido obtener la respuesta.</p>
        <p>{failure.kind === 'api' ? `Código: ${failure.code}.` : 'La API de CODEMIND no responde.'}</p>
      </div>
    </div>
  );
}
