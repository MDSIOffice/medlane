// Globals provided by <script> tags / other files rather than imports.
// Shared record types can also go here (use via JSDoc: /** @type {import("../types/global").Foo} */).
declare const L: any; // Leaflet (loaded on demand)
declare function loadGameBestBadge(...args: any[]): any; // defined in game.js, exposed on window
interface Window {
  L: any;
  PDFLib: any;
  loadGameBestBadge: (...args: any[]) => any;
}
