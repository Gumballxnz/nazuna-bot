import axios from 'axios';

const UA = 'Mozilla/5.0 (bot)';

export async function download(url) {
  try {

    const jsonUrl = url.replace(/\/$/, '') + '.json';

    const { data } = await axios.get(jsonUrl, {
      headers: { 'User-Agent': UA },
      timeout: 15000
    });

    const post = data?.[0]?.data?.children?.[0]?.data;
    if (!post) {
      return { ok: false, message: 'Post não encontrado.' };
    }

    if (post.is_video && post.media?.reddit_video?.fallback_url) {
      const videoUrl = post.media.reddit_video.fallback_url;
      const fileResponse = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 180000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      return {
        ok: true,
        buffer: Buffer.from(fileResponse.data),
        title: post.title || 'Post do Reddit',
        author: post.author || 'Desconhecido',
        subreddit: post.subreddit || 'unknown',
        isVideo: true,
        upvotes: post.ups || 0,
        filename: `reddit_${Date.now()}.mp4`
      };
    }

    if (post.url_overridden_by_dest && /\.(jpg|png|gif|webp)/i.test(post.url_overridden_by_dest)) {
      const fileResponse = await axios.get(post.url_overridden_by_dest, {
        responseType: 'arraybuffer',
        timeout: 60000
      });

      return {
        ok: true,
        buffer: Buffer.from(fileResponse.data),
        title: post.title || 'Post do Reddit',
        author: post.author || 'Desconhecido',
        subreddit: post.subreddit || 'unknown',
        isVideo: false,
        upvotes: post.ups || 0,
        filename: `reddit_${Date.now()}.jpg`
      };
    }

    return { ok: false, message: 'Nenhuma mídia encontrada neste post.' };
  } catch (error) {
    console.error('Erro ao baixar do Reddit:', error);

    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return { ok: false, message: 'O download demorou muito tempo. Tente novamente.' };
    }

    return { ok: false, message: error.message || 'Erro ao processar a solicitação.' };
  }
}

export default { download };
