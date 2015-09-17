var http = require('http');
var crypto = require('crypto');
var url = require('url');
var path = require('path');
var fs = require('fs');

var srv = http.createServer();
var serverName="liuguang/ws",socketArr=[];

function sendWsMessage(socket,frameData){
	//console.log(frameData);
	//console.log(frameData.payloadData.toString());
	var frameArr=[],tmp,i;
	frameArr.push((frameData.fin<<7)+(frameData.rsv1<<6)+(frameData.rsv2<<5)+(frameData.rsv3<<4)+frameData.opcode);
	tmp=(frameData.mask<<7);
	if((frameData.payloadLength>=0)&&(frameData.payloadLength<=125)){
		frameArr.push(tmp+frameData.payloadLength);
	}
	else if(frameData.payloadLength<parseInt("1111"+"1111"+"1111"+"1111",2)){
		frameArr.push(tmp+126);
		frameArr.push(frameData.payloadLength>>8);
		frameArr.push(frameData.payloadLength&parseInt("1111"+"1111",2));
	}
	else if(frameData.payloadLength>parseInt("1111"+"1111"+"1111"+"1111",2)){
		frameArr.push(tmp+127);
		frameArr.push(frameData.payloadLength>>24);
		frameArr.push((frameData.payloadLength&parseInt("1111"+"1111"+"1111"+"1111"+"1111"+"1111",2))>>16);
		frameArr.push((frameData.payloadLength&parseInt("1111"+"1111"+"1111"+"1111",2))>>8);
		frameArr.push(frameData.payloadLength&parseInt("1111"+"1111",2));
	}
	if(frameData.mask!=0){
		for(i=0;i<4;i++){
			frameArr.push(frameData.maskingKey[i]);
		}
	}
	for(i=0;i<frameData.payloadLength;i++){
		tmp=frameData.payloadData[i];
		if(frameData.mask!=0)
			tmp=tmp&frameData.maskingKey[i%4];
		frameArr.push(tmp);
	}
	socket.write(new Buffer(frameArr));
}
/**
 * 广播
 */
function broadcastMsg(buff,noSocket){
	var key,socket;
	for(key in socketArr){
		socket=socketArr[key];
		if((socket==null)||(socket==noSocket))
			continue;
		sendWsMessage(socket,{
			"fin":1,
			"rsv1":0,
			"rsv2":0,
			"rsv3":0,
			"opcode":1,
			"mask":0,
			"payloadLength":buff.length,
			"payloadData":buff
		});
	}
}
//将socket从socketArr中删除
function removeSocket(socket){
	var key;
	for(key in socketArr){
		if(socket==socketArr[key])
			delete socketArr[key];
	}
}
/**
 * 处理浏览器发来的数据帧
 */
function socketSrv(socket,data){
	var i=-1,tmp,frameData={};
	tmp=data[++i];
	frameData.fin=((tmp&parseInt("1000"+"0000",2))==0)?0:1;
	frameData.rsv1=((tmp&parseInt("100"+"0000",2))==0)?0:1,
	frameData.rsv2=((tmp&parseInt("10"+"0000",2))==0)?0:1,
	frameData.rsv3=((tmp&parseInt("1"+"0000",2))==0)?0:1;
	frameData.opcode=tmp&parseInt("1111",2);
	tmp=data[++i];
	frameData.mask=((tmp&parseInt("1000"+"0000",2))==0)?0:1;
	frameData.payloadLength=tmp&parseInt("111"+"1111",2);
	if(frameData.payloadLength==126){
		frameData.payloadLength=data[++i]<<8;
		frameData.payloadLength+=data[++i];
	}
	else if(frameData.payloadLength==127){
		frameData.payloadLength=data[++i]<<24;
		frameData.payloadLength+=(data[++i]<<16);
		frameData.payloadLength+=(data[++i]<<8);
		frameData.payloadLength+=data[++i];
	}
	var j;
	if(frameData.mask!=0){
		frameData.maskingKey =new Buffer(4);
		for(j=0;j<4;j++){
			frameData.maskingKey[j]=data[++i];
		}
	}
	frameData.payloadData=[];
	for(j=0;j<frameData.payloadLength;j++){
		tmp=data[++i];
		/*有掩码*/
		if(frameData.mask!=0)
			frameData.payloadData.push(tmp^frameData.maskingKey[j%4]);
		else
			frameData.payloadData.push(tmp);
	}
	frameData.payloadData=new Buffer(frameData.payloadData);
	//console.log(frameData);
	//console.log(frameData.payloadData.toString());
	//文本帧
	if(frameData.opcode==1){
		broadcastMsg(frameData.payloadData,socket);
	}
	//close帧
	else if(frameData.opcode==8){
		removeSocket(socket);
		socket.end();
	}
	//ping帧
	else if(frameData.opcode==9){
		removeSocket(socket);
		sendWsMessage(socket,{
			"fin":1,
			"rsv1":0,
			"rsv2":0,
			"rsv3":0,
			"opcode":10,
			"mask":0,
			"payloadLength":frameData.payloadLength,
			"payloadData":frameData.payloadData
		});
	}
	
}
/**
 * 用于发送404
 */
function send404(res){
	var errPath=path.resolve(__dirname,"./public_html/404.html");
	fs.stat(errPath,function(err, stats){
		//404文件不存在,发送500错误
		if (err){
			res.writeHead(500, {
				"Content-Type": "text/html; charset=utf-8",
				"Server": serverName
			});
			res.end("<html>\r\n\
<head><title>500 Error</title></head>\r\n\
<body bgcolor=\"white\">\r\n\
<center><h1>500 找不到404错误页面！</h1></center>\r\n\
<hr><center>"+serverName+"</center>\r\n\
</body>\r\n\
</html>");
		}
		else{
			res.writeHead(404, {
				"Content-Type": "text/html; charset=utf-8",
				"Server": serverName
			});
			fs.readFile(errPath, function (err, data) {
			  if (err)
				  throw err;
			  else
				res.end(data);
			});
		}
	});
}
function sendfile(res,filepath){
	var mimeTypes={
		"html":"text/html; charset=utf-8",
		"xml":"application/xml; charset=utf-8",
		"css":"text/css; charset=utf-8",
		"js":"text/javascript; charset=utf-8",
		"json":"application/json; charset=utf-8",
		"txt":"text/plain; charset=utf-8",
		"jpg":"image/jpeg",
		"jpeg":"image/jpeg",
		"png":"image/png",
		"gif":"image/gif",
		"ico":"image/x-icon"
	};
	var ctype="application/octet-stream",suffix=path.parse(filepath).ext.substring(1);
	if(suffix in mimeTypes)
		ctype=mimeTypes[suffix];
	res.writeHead(200, {
				"Content-Type": ctype,
				"Server": serverName
	});
	fs.readFile(filepath, function (err, data) {
	  if (err)
		  send404(res);
	  else
		res.end(data);
	});
}
//HTTP server
srv.on("request",function (req, res) {
	var urlData=url.parse(req.url,true);
	//文件真实路径
	var tFilepath=path.resolve(__dirname,"./public_html","."+urlData.pathname);
	fs.stat(tFilepath,function(err, stats){
		if (err){
			send404(res);
			return;
		}
		//如果是一个目录
		if(stats.isDirectory()){
			tFilepath=path.resolve(tFilepath,"./index.html");
			fs.stat(tFilepath,function(err1, stats1){
				if (err1){
					send404(res);
					return;
				}
				else{
					sendfile(res,tFilepath);
					return;
				}
			});
		}
		else
			sendfile(res,tFilepath);
	});
});
//Websocket server
srv.on('upgrade', function(req, socket, head) {
	if(req.httpVersion<1.1){
		socket.end();
		return;
	}
	var headers=req.headers;
	//console.log(headers);
	if(headers.upgrade!="websocket"){
		socket.end();
		return;
	}
	if(!("connection" in headers)){
		socket.end();
		return;
	}
	if(headers.connection!="Upgrade"){
		socket.end();
		return;
	}
	if(!("sec-websocket-key" in headers)){
		socket.end();
		return;
	}
	var shasum = crypto.createHash('sha1');
	shasum.update(headers["sec-websocket-key"]+"258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
	var respStr="HTTP/1.1 101 Switching Protocols\r\n"+
		"Upgrade: WebSocket\r\n" +
        "Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: "+shasum.digest("base64")+"\r\n"+
		"\r\n";
  socket.write(respStr);
  //console.log(respStr);
  socket.setTimeout(0);
  socketArr.push(socket);
  socket.on("data",function(data){
	  socketSrv(this,data);
  });
});
srv.listen(80);
console.log("server is runing !");