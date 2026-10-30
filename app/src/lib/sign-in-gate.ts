export const needsSignIn = (path: string) => path !== '/sign-in' && !path.startsWith('/assets/')
