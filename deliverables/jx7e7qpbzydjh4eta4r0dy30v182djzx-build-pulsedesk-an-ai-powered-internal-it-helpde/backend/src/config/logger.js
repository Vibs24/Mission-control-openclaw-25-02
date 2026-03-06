module.exports={log:(level,msg,meta={})=>console.log(JSON.stringify({level,msg,...meta,time:new Date().toISOString()}))};
