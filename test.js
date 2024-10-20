const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const { format } = require('date-fns');

const url = 'https://www.haripriya.org/blog';

axios.get(url).then(response => {
  const $ = cheerio.load(response.data);
  let items = [];

  $('div[data-hook="post-item"]').each((i, element) => {
    const title = $(element).find('h2').text().trim();
    const description = $(element).find('p').first().text().trim();
    const link = $(element).find('a').attr('href');
    const guid = $(element).find('a').attr('href'); // or generate a unique ID
    const pubDate = format(new Date($(element).find('.blog-date').text()), "EEE, dd MMM yyyy HH:mm:ss 'GMT'");
    const creator = 'Haripriya Sridharan';
    const imageUrl = $(element).find('img').attr('src');

    items.push(`<item>
      <title>${title}</title>
      <description>${description}</description>
      <link>${link}</link>
      <guid isPermaLink="false">${guid}</guid>
      <pubDate>${pubDate}</pubDate>
      <enclosure url="${imageUrl}" length="0" type="image/png"/>
      <dc:creator>${creator}</dc:creator>
    </item>`);
  });

  const xmlContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
  <channel>
    <title>Haripriya</title>
    <description>Haripriya</description>
    <link>https://www.haripriya.org/blog</link>
    <generator>RSS for Node</generator>
    <lastBuildDate>${format(new Date(), "EEE, dd MMM yyyy HH:mm:ss 'GMT'")}</lastBuildDate>
    <atom:link href="https://www.haripriya.org/blog-feed.xml" rel="self" type="application/rss+xml"/>
    ${items.join('\n')}
  </channel>
</rss>`;

  fs.writeFileSync('blog-feed.xml', xmlContent);
  console.log('RSS feed generated successfully.');
}).catch(error => {
  console.error('Failed to fetch or parse blog data:', error);
});
