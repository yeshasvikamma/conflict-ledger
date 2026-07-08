import { describe, expect, it, vi } from 'vitest';
import { fetchCpj, parseCpjResponse } from './cpj.ts';

const CASUALTIES_URL =
  'https://cpj.org/2023/10/journalist-casualties-in-the-israel-gaza-war/';
const METHODOLOGY_URL = 'https://cpj.org/data-methodology/';

function officialReport(
  overrides: {
    url?: string;
    canonicalUrl?: string;
    headline?: string;
    rawHtml?: string;
    publishedAt?: string;
  } = {},
) {
  const url = overrides.url ?? CASUALTIES_URL;
  const canonicalUrl = overrides.canonicalUrl ?? url;
  const headline = overrides.headline ?? 'Journalist casualties in the Israel-Gaza war';
  const rawHtml =
    overrides.rawHtml ??
    '<p>CPJ has tracked and documented the cases of members of the press.</p>';
  const publishedAt = overrides.publishedAt ?? '2023-10-13T02:00:00-04:00';

  return {
    url,
    html: `
      <!doctype html>
      <html>
        <head>
          <link rel="canonical" href="${canonicalUrl}">
          <meta property="og:title" content="${headline}">
          <meta property="article:published_time" content="${publishedAt}">
        </head>
        <body>
          <article>
            <h1>${headline}</h1>
            <div class="entry-content">${rawHtml}</div>
          </article>
        </body>
      </html>
    `,
  };
}

describe('parseCpjResponse', () => {
  it('parses an official CPJ report fixture into a CPJ item', () => {
    expect(parseCpjResponse({ reports: [officialReport()] })).toEqual([
      {
        url: CASUALTIES_URL,
        headline: 'Journalist casualties in the Israel-Gaza war',
        raw_text: 'CPJ has tracked and documented the cases of members of the press.',
        published_at: '2023-10-13T02:00:00-04:00',
      },
    ]);
  });

  it('preserves the stable official canonical URL', () => {
    const result = parseCpjResponse({
      reports: [
        officialReport({
          url: 'https://cpj.org/2023/10/journalist-casualties-in-the-israel-gaza-war/amp/',
          canonicalUrl: CASUALTIES_URL,
        }),
      ],
    });

    expect(result[0]!.url).toBe(CASUALTIES_URL);
  });

  it('skips a report whose article text is blank', () => {
    expect(
      parseCpjResponse({
        reports: [officialReport({ rawHtml: '<p> &nbsp; </p>' })],
      }),
    ).toEqual([]);
  });

  it('skips malformed records and non-CPJ canonical URLs', () => {
    expect(
      parseCpjResponse({
        reports: [
          null,
          {},
          { url: CASUALTIES_URL, html: 42 },
          officialReport({ canonicalUrl: 'https://example.com/copied-report' }),
        ],
      }),
    ).toEqual([]);
  });

  it('deduplicates duplicate canonical CPJ URLs', () => {
    const result = parseCpjResponse({
      reports: [
        officialReport(),
        officialReport({ rawHtml: '<p>Later duplicate wording.</p>' }),
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.raw_text).toBe(
      'CPJ has tracked and documented the cases of members of the press.',
    );
  });

  it('preserves first-seen order for distinct official reports', () => {
    const result = parseCpjResponse({
      reports: [
        officialReport(),
        officialReport({
          url: METHODOLOGY_URL,
          headline: 'Data Methodology and FAQs',
          rawHtml:
            '<p>CPJ researchers and editors employ a rigorous verification process.</p>',
        }),
      ],
    });

    expect(result.map((item) => item.url)).toEqual([CASUALTIES_URL, METHODOLOGY_URL]);
  });

  it('throws clearly for a malformed top-level response', () => {
    expect(() => parseCpjResponse(null)).toThrow(
      '[discovery] CPJ response is malformed: expected an object',
    );
    expect(() => parseCpjResponse({ records: [] })).toThrow(
      '[discovery] CPJ response is malformed: expected a reports array',
    );
  });
});

describe('fetchCpj', () => {
  it('uses the injected request and makes no live request in tests', async () => {
    const request = vi.fn(async () => ({ reports: [officialReport()] }));

    const result = await fetchCpj(request);

    expect(request).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]!.url).toBe(CASUALTIES_URL);
  });
});
