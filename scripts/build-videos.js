const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const path = require('path');
const fs = require('fs');

const API_KEY = 'AIzaSyDAaAhjAvzrtd-rfnQAfc5I1p1Z50Tv8t8';
const CHANNEL_ID = 'UC3GAkN1CvV7k7IZZLa7-neg';

async function main() {
    let nextPageToken = '';
    let videoItems = [];

    while (videoItems.length < 50) {
        const url = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&channelId=${CHANNEL_ID}&part=snippet,id&order=date&maxResults=25&pageToken=${nextPageToken}`;
        const resp = await fetch(url);
        const data = await resp.json();
        videoItems.push(...data.items.filter(i => i.id.kind === 'youtube#video'));
        nextPageToken = data.nextPageToken;
        if (!nextPageToken) break;
    }

    const ids = videoItems.map(i => i.id.videoId).join(',');
    const detailsResp = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&id=${ids}&part=snippet,contentDetails`
    );
    const details = await detailsResp.json();

    function parseISO(iso) {
        const match = iso.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
        const minutes = parseInt(match[1] || 0);
        const seconds = parseInt(match[2] || 0);
        return {
            seconds: minutes * 60 + seconds,
            readable: `${minutes}:${seconds.toString().padStart(2, '0')}`
        };
    }

    const filtered = details.items
    .filter(v => true)
    .slice(0, 100)
    .map(v => {
        const { seconds, readable } = parseISO(v.contentDetails.duration);
        return {
            id: v.id,
            title: v.snippet.title,
            thumbnail: v.snippet.thumbnails.medium.url,
            url: `https://www.youtube.com/watch?v=${v.id}`,
            durationSeconds: seconds,
            duration: readable
        };
    });

    fs.writeFileSync(
        path.resolve(__dirname, '../videos.json'),
                     JSON.stringify(filtered, null, 2)
    );
}

main();
