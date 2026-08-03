import { createContext, useContext, type ReactNode } from 'react';

/**
 * Where an upload is going, supplied by the screen that owns the form.
 *
 * A file field needs three runtime facts the *schema* cannot carry — which
 * organization, which challenge, and the caller's ID token. They are not
 * properties of the field (the same schema is used by different challenges),
 * so they arrive as context rather than as config, and `FieldInputProps` stays
 * the same shape it has for every other field type.
 *
 * Absent context is a legitimate state, not an error: the form builder renders
 * the same components to *preview* a schema, and a preview must not upload
 * anything. `useUploadContext` returns null there and the input says so.
 */
export interface UploadContextValue {
  orgId: string;
  challengeId: string;
  /**
   * Resolves the caller's Firebase ID token.
   *
   * A function, not a string: tokens expire in an hour and a photograph on a
   * slow connection can outlive one. Fetching per upload means the token is
   * always fresh at the moment it is checked.
   */
  getIdToken: () => Promise<string | null>;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({
  value, children,
}: {
  value: UploadContextValue;
  children: ReactNode;
}) {
  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export const useUploadContext = () => useContext(UploadContext);
