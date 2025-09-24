const axios = require('axios');

module.exports = async (req, res) => {
  try {
    // 1. 获取URL参数
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ 
        error: "请提供抖音链接",
        example: "/api/parse?url=https://v.douyin.com/iJNvRkF9/"
      });
    }

    console.log("🔗 接收到请求:", url);
    
    // 2. 处理短链
    let finalUrl = url;
    if (url.includes('v.douyin.com')) {
      try {
        const redirectRes = await axios.get(url, {
          maxRedirects: 5,
          timeout: 8000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Mobile Safari/537.36',
            'Referer': 'https://www.douyin.com/'
          }
        });
        finalUrl = redirectRes.request?.res?.responseUrl || url;
        console.log("🔗 短链重定向到:", finalUrl);
      } catch (error) {
        console.error("⚠️ 短链处理失败:", error.message);
      }
    }

    // 3. 提取视频ID
    const idMatch = finalUrl.match(/(?:video|note)\/(\d{18,19})/);
    if (!idMatch || !idMatch[1]) {
      return res.status(400).json({ 
        error: "无法提取有效视频ID", 
        receivedUrl: url,
        processedUrl: finalUrl
      });
    }
    const aweme_id = idMatch[1];
    console.log("🆔 提取到视频ID:", aweme_id);

    // 4. 调用抖音API
    try {
      const apiRes = await axios.get(
        `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${aweme_id}`,
        {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Mobile Safari/537.36',
            'Referer': 'https://www.douyin.com/',
            'Cookie': 'ttwid=1;'
          }
        }
      );

      const data = apiRes.data?.item_list?.[0];
      if (!data) {
        throw new Error("API返回无数据");
      }

      console.log("✅ 视频解析成功:", {
        desc: data.desc.substring(0, 20) + "...",
        author: data.author?.nickname
      });

      // 5. 返回结果
      return res.status(200).json({
        success: true,
        videoUrl: data.video?.play_addr?.url_list?.[0] || "",
        desc: data.desc || "",
        author: data.author?.nickname || "未知",
        like_count: data.statistics?.digg_count || 0,
        comment_count: data.statistics?.comment_count || 0,
        collect_count: data.statistics?.collect_count || 0,
        share_count: data.statistics?.share_count || 0,
        publish_time: data.create_time ? new Date(data.create_time * 1000).toISOString() : "未知"
      });
    } catch (apiError) {
      console.error("❌ 抖音API调用失败:", apiError.message);
      
      // 6. 尝试备用解析
      try {
        console.log("🔄 尝试备用解析服务...");
        const backupApi = "https://min.taoanlife.com/dy/api/de-url";
        const backupRes = await axios.post(backupApi, {
          share_url: finalUrl,
          de_type: 1
        }, {
          timeout: 10000,
          headers: {
            'de-secret-key': 'CB9c3aOfTzFqePMjUARg6JQiLHlNnxut',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (backupRes.data.code === 0) {
          const data = backupRes.data.data;
          console.log("✅ 备用解析成功:", {
            desc: data.desc?.substring(0, 20) + "...",
            author: data.author?.nickname
          });
          
          return res.status(200).json({
            success: true,
            videoUrl: data.play_url,
            desc: data.desc || "无描述",
            author: data.author?.nickname || "未知"
          });
        }
      } catch (backupError) {
        console.error("❌ 备用解析失败:", backupError.message);
      }
      
      return res.status(500).json({ 
        error: "视频解析失败", 
        details: apiError.message 
      });
    }
  } catch (error) {
    console.error("🚨 全局错误:", error.message);
    return res.status(500).json({ 
      error: "服务端错误", 
      message: error.message 
    });
  }
};
