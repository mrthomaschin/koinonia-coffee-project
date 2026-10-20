import { escapeHtml } from "./resend_client";

/**
 * Markup the code inserts into Resend templates through `_html` variables.
 * Kept table-based with inline styles to match the templates' layout in every email client.
 */
const FONT =
  "'Rethink Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
/** Brand palette (src/styles/tokens.css) flattened onto the templates' pearl card. */
const EUCALYPTUS = "#84825E";
const PEARL = "#F8F5EB";
const TEXT = "#2F2B39";
const TEXT_SECONDARY = "#5F5B64";
const HAIRLINE = "#D9D3C7";
const TABLE =
  'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"';

const textStyle = (
  size: number,
  color = TEXT_SECONDARY,
  weight = "400",
): string =>
  `font-family:${FONT};font-size:${size}px;line-height:1.5;color:${color};font-weight:${weight};`;

/**
 * One line in an item list: optional image, name with detail lines beneath it,
 * and an optional price in its own right-aligned column so amounts scan down the list.
 */
export const itemRowHtml = (item: {
  name: string;
  details?: string[];
  price?: string;
  imageUrl?: string;
}): string => {
  const image = item.imageUrl
    ? `<td width="88" valign="top" style="width:88px;padding-bottom:16px;padding-right:16px;"><img src="${escapeHtml(item.imageUrl)}" width="72" height="72" border="0" alt="${escapeHtml(item.name)}" style="display:block;width:72px;height:72px;border:1px solid ${HAIRLINE};border-radius:2px;object-fit:cover;"></td>`
    : "";
  const details = (item.details || [])
    .filter(Boolean)
    .map(
      (detail) =>
        `<p style="margin:0 0 2px 0;${textStyle(13)}">${escapeHtml(detail)}</p>`,
    )
    .join("");
  const price = item.price
    ? `<td align="right" valign="top" style="padding-bottom:16px;padding-left:16px;white-space:nowrap;${textStyle(15, TEXT, "500")}">${escapeHtml(item.price)}</td>`
    : "";
  return `
<table ${TABLE} style="border-bottom:1px solid ${HAIRLINE};margin-bottom:16px;">
  <tr>
    ${image}<td valign="top" style="padding-bottom:16px;">
      <p style="margin:0 0 4px 0;${textStyle(15, TEXT, "500")}">${escapeHtml(item.name)}</p>${details}
    </td>${price}
  </tr>
</table>`;
};

/** Discount row for an order totals table; replaces the EmailJS {{#has_discount}} section. */
export const discountRowHtml = (
  code?: string,
  percent?: number,
  amount?: number,
): string =>
  code
    ? `
<tr>
  <td style="padding-top:12px;padding-bottom:12px;border-top:1px solid ${HAIRLINE};${textStyle(11, EUCALYPTUS, "500")}letter-spacing:1.5px;text-transform:uppercase;">Discount (${escapeHtml(code)} &middot; ${percent || 0}% off)</td>
  <td align="right" style="padding-top:12px;padding-bottom:12px;border-top:1px solid ${HAIRLINE};${textStyle(14, EUCALYPTUS, "500")}">-$${(amount || 0).toFixed(2)}</td>
</tr>`
    : "";

/** Centered eucalyptus call-to-action button matching the templates' buttons. */
export const buttonHtml = (url: string, label: string): string => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 8px auto;">
  <tr>
    <td align="center" bgcolor="${EUCALYPTUS}" style="background-color:${EUCALYPTUS};border-radius:8px;">
      <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:16px 40px;${textStyle(12, PEARL, "500")}letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
