export const failedRequests = (entries) =>
  entries.filter(({responseStatus}) => responseStatus === 0 || responseStatus >= 400).map(({name, responseStatus}) => `${new URL(name).pathname} ${responseStatus}`)
