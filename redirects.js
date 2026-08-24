// No static redirects. The template shipped an Internet Explorer redirect to
// /ie-incompatible.html here, but that file does not exist in public/, so any
// IE visitor entered a redirect loop that ended in a 404 — removed. Editor-
// managed redirects live in the Payload redirects plugin instead.
const redirects = async () => []

export default redirects
