import "@tanstack/react-query";

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: { showError?: boolean };
    mutationMeta: { showError?: boolean };
  }
}
