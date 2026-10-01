declare module '*.svg' {
  const content: string;
  export default content;
}

interface Window {
  secretSantaTurnstileLoaded?: () => void;
  turnstile?: import('./utils/turnstile').TurnstileApi;
}
