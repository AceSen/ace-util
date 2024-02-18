const fs = require('fs');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HDNodeWallet } = require('ethers');

const config = require('./config.json')

function parseProxy2Arr() {
    let arr;
    try {
      const data = fs.readFileSync('./proxy.txt', 'utf-8');
      arr = data.split('\n');
      console.log(`✅ 读取代理文件成功，代理数量： ${arr.length}`)
    } catch(err) {
      console.log(`❌ 读取代理文件失败, 错误信息: ${err}`);
    }
    return arr;
}

// 目标参数：
const websiteKey = "0x4AAAAAAARdAuciFArKhVwt";
const websiteURL = "https://artio.faucet.berachain.com";
// 验证码类型：
const taskType = "TurnstileTaskProxylessM1";


async function createTask() {
    try {
      const url = "https://api.yescaptcha.com/createTask";
      const data = {
        clientKey: config.yescaptchaKey,
        task: {
          websiteURL: websiteURL,
          websiteKey: websiteKey,
          type: taskType
        }
      };
  
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data),
        agent: false,
        rejectUnauthorized: false
      });
  
      const result = await response.json();

      const taskId = result.taskId;
      if (taskId) {
        console.log(`✅ google人机验证【生成taskId】成功, taskId: ${taskId}`)
        return taskId;
      } else {
        console.log(`❌ google人机验证【生成taskId】失败 ${result}`);
      }
    } catch (error) {
        console.log(`❌ google人机验证【生成taskId】发生异常 ${error}`);
    }
}

async function getResponse(taskID) {
    let times = 0;
    while (times < 10) {
      try {
        const url = "https://api.yescaptcha.com/getTaskResult";
        const data = {
          clientKey: config.yescaptchaKey,
          taskId: taskID
        };
  
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data),
          agent: false,
          rejectUnauthorized: false
        });
  
        const result = await response.json();

        console.log(result)

        const solution = result.solution;
        if (solution) {
          // const response = solution.gRecaptchaResponse;
          const response = solution.token;
          if (response) {
            console.log(`✅ google人机验证成功, 返回值： ${JSON.stringify(result)}`);
            console.log(`✅ 开始领取token`);
            return response;
          }
        } else {
          console.log(`pending...... google人机验证，等待结果： ${JSON.stringify(result)}, 重试次数：${times + 1}`);
        }
      } catch (error) {
        console.log(`❌ google人机验证发生异常 ${error}, 重试次数：${times}`);
      }
      times++;
      await new Promise(resolve => setTimeout(resolve, 1500)); // 等待3秒钟
    }
}

async function testIpAgent(proxy) {
  console.log("开始测试代理IP")
  const agent = new HttpsProxyAgent(`http://${proxy}`);
  const url = 'https://ipv4.icanhazip.com/';
  const response = await fetch(url, {
      method: 'get',
      agent: agent,
      timeout: 3000
  })

  const result = await response.text();
  console.log(`当前IP：${result.trim()}`)
}

async function claimFromFaulcet(address, proxy) {

  await testIpAgent(proxy);

  const taskId = await createTask();
  const res = await getResponse(taskId);

  const headers = {
    "accept": "*/*",
    "accept-language": "zh-CN,zh;q=0.9",
    "authorization": `Bearer ${res}`,
    "content-type": "text/plain;charset=UTF-8",
    "sec-ch-ua": "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "Referer": "https://artio.faucet.berachain.com/",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  }

  const url = `https://artio-80085-faucet-api-cf.berachain.com/api/claim?address=${address}`;

  const agent = new HttpsProxyAgent(`http://${proxy}`);

  const response = await fetch(url, 
    {
      method: 'POST',
      headers: headers,
      referrer: "https://artio.faucet.berachain.com/",
      agent: agent,
      body: JSON.stringify({address: address}),
    }
  )

  if (response && response.status == 200) {
    const result = await response.json();
    console.log(result)
    console.log(`✅ 请求成功； 返回值： ${JSON.stringify(result)}`)
  } else {
    const result = await response.json();
    console.log(`❌ 领取失败； 返回值： ${JSON.stringify(result)}`)
  }

}

async function handleClaim() {
  let proxies = parseProxy2Arr();
  const times = Math.min(proxies.length, config.claimTimes);

  console.log(`实际运行次数: ${times}`)

  const prePath = "m/44'/60'/0'/0/"
  let start = config.walletStartNo;

  for (let i = 0; i < times; i++) {
    let path = prePath + start;
    let wallet = HDNodeWallet.fromPhrase(config.phrase, null, path);
    console.log(`第【 ${(i + 1)} 】次, 当前地址：${wallet.address}`)
    try {
      await claimFromFaulcet(wallet.address, proxies[i]);
    } catch(err) {
      console.log(`❌ 领取发生异常， 继续执行下一个地址。 一场信息： ${err.message}`)
    }
    start++;
    new Promise(resolve => setTimeout(resolve, config.delay))
  }

}

handleClaim();