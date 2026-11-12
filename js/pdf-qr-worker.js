import './vendor/jsqr.js?v=3.7.0';

self.onmessage=event=>{
  const {id,width,height,data}=event.data;
  try{
    const decode=self.jsQR;
    if(typeof decode!=='function')throw new Error('The local QR decoder is unavailable');
    const result=decode(data,width,height,{inversionAttempts:'attemptBoth'});
    if(!result){self.postMessage({id,ok:true,detections:[]});return}
    const points=[result.location.topLeftCorner,result.location.topRightCorner,result.location.bottomLeftCorner,result.location.bottomRightCorner];
    const xs=points.map(point=>point.x),ys=points.map(point=>point.y);
    const left=Math.min(...xs),top=Math.min(...ys);
    const detection={rawValue:result.data,boundingBox:{x:left,y:top,width:Math.max(...xs)-left,height:Math.max(...ys)-top}};
    self.postMessage({id,ok:true,detections:[detection]});
  }catch(error){
    self.postMessage({id,ok:false,error:String(error?.message||error)});
  }
};
