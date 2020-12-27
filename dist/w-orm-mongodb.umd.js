/*!
 * w-orm-mongodb v1.1.21
 * (c) 2018-2020 yuda-lyu(semisphere)
 * Released under the MIT License.
 */
!function(t,r){"object"==typeof exports&&"undefined"!=typeof module?module.exports=r(require("events"),require("mongodb"),require("stream")):"function"==typeof define&&define.amd?define(["events","mongodb","stream"],r):(t="undefined"!=typeof globalThis?globalThis:t||self)["w-orm-mongodb"]=r(t.events,t.mongodb,t.stream)}(this,(function(t,r,e){"use strict";function n(t){return t&&"object"==typeof t&&"default"in t?t:{default:t}}var o=n(t),u=n(r),a=n(e),i="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:{};function c(t,r,e){return t(e={path:r,exports:{},require:function(t,r){return function(){throw new Error("Dynamic requires are not currently supported by @rollup/plugin-commonjs")}(null==r&&e.path)}},e.exports),e.exports}var f=c((function(t){function r(e){return"function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?t.exports=r=function(t){return typeof t}:t.exports=r=function(t){return t&&"function"==typeof Symbol&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t},r(e)}t.exports=r})),l=c((function(t){var r=function(t){var r,e=Object.prototype,n=e.hasOwnProperty,o="function"==typeof Symbol?Symbol:{},u=o.iterator||"@@iterator",a=o.asyncIterator||"@@asyncIterator",i=o.toStringTag||"@@toStringTag";function c(t,r,e){return Object.defineProperty(t,r,{value:e,enumerable:!0,configurable:!0,writable:!0}),t[r]}try{c({},"")}catch(t){c=function(t,r,e){return t[r]=e}}function l(t,r,e,n){var o=r&&r.prototype instanceof b?r:b,u=Object.create(o.prototype),a=new L(n||[]);return u._invoke=function(t,r,e){var n=v;return function(o,u){if(n===h)throw new Error("Generator is already running");if(n===d){if("throw"===o)throw u;return z()}for(e.method=o,e.arg=u;;){var a=e.delegate;if(a){var i=S(a,e);if(i){if(i===y)continue;return i}}if("next"===e.method)e.sent=e._sent=e.arg;else if("throw"===e.method){if(n===v)throw n=d,e.arg;e.dispatchException(e.arg)}else"return"===e.method&&e.abrupt("return",e.arg);n=h;var c=s(t,r,e);if("normal"===c.type){if(n=e.done?d:p,c.arg===y)continue;return{value:c.arg,done:e.done}}"throw"===c.type&&(n=d,e.method="throw",e.arg=c.arg)}}}(t,e,a),u}function s(t,r,e){try{return{type:"normal",arg:t.call(r,e)}}catch(t){return{type:"throw",arg:t}}}t.wrap=l;var v="suspendedStart",p="suspendedYield",h="executing",d="completed",y={};function b(){}function g(){}function j(){}var w={};w[u]=function(){return this};var m=Object.getPrototypeOf,_=m&&m(m(P([])));_&&_!==e&&n.call(_,u)&&(w=_);var O=j.prototype=b.prototype=Object.create(w);function x(t){["next","throw","return"].forEach((function(r){c(t,r,(function(t){return this._invoke(r,t)}))}))}function A(t,r){function e(o,u,a,i){var c=s(t[o],t,u);if("throw"!==c.type){var l=c.arg,v=l.value;return v&&"object"===f(v)&&n.call(v,"__await")?r.resolve(v.__await).then((function(t){e("next",t,a,i)}),(function(t){e("throw",t,a,i)})):r.resolve(v).then((function(t){l.value=t,a(l)}),(function(t){return e("throw",t,a,i)}))}i(c.arg)}var o;this._invoke=function(t,n){function u(){return new r((function(r,o){e(t,n,r,o)}))}return o=o?o.then(u,u):u()}}function S(t,e){var n=t.iterator[e.method];if(n===r){if(e.delegate=null,"throw"===e.method){if(t.iterator.return&&(e.method="return",e.arg=r,S(t,e),"throw"===e.method))return y;e.method="throw",e.arg=new TypeError("The iterator does not provide a 'throw' method")}return y}var o=s(n,t.iterator,e.arg);if("throw"===o.type)return e.method="throw",e.arg=o.arg,e.delegate=null,y;var u=o.arg;return u?u.done?(e[t.resultName]=u.value,e.next=t.nextLoc,"return"!==e.method&&(e.method="next",e.arg=r),e.delegate=null,y):u:(e.method="throw",e.arg=new TypeError("iterator result is not an object"),e.delegate=null,y)}function k(t){var r={tryLoc:t[0]};1 in t&&(r.catchLoc=t[1]),2 in t&&(r.finallyLoc=t[2],r.afterLoc=t[3]),this.tryEntries.push(r)}function E(t){var r=t.completion||{};r.type="normal",delete r.arg,t.completion=r}function L(t){this.tryEntries=[{tryLoc:"root"}],t.forEach(k,this),this.reset(!0)}function P(t){if(t){var e=t[u];if(e)return e.call(t);if("function"==typeof t.next)return t;if(!isNaN(t.length)){var o=-1,a=function e(){for(;++o<t.length;)if(n.call(t,o))return e.value=t[o],e.done=!1,e;return e.value=r,e.done=!0,e};return a.next=a}}return{next:z}}function z(){return{value:r,done:!0}}return g.prototype=O.constructor=j,j.constructor=g,g.displayName=c(j,i,"GeneratorFunction"),t.isGeneratorFunction=function(t){var r="function"==typeof t&&t.constructor;return!!r&&(r===g||"GeneratorFunction"===(r.displayName||r.name))},t.mark=function(t){return Object.setPrototypeOf?Object.setPrototypeOf(t,j):(t.__proto__=j,c(t,i,"GeneratorFunction")),t.prototype=Object.create(O),t},t.awrap=function(t){return{__await:t}},x(A.prototype),A.prototype[a]=function(){return this},t.AsyncIterator=A,t.async=function(r,e,n,o,u){void 0===u&&(u=Promise);var a=new A(l(r,e,n,o),u);return t.isGeneratorFunction(e)?a:a.next().then((function(t){return t.done?t.value:a.next()}))},x(O),c(O,i,"Generator"),O[u]=function(){return this},O.toString=function(){return"[object Generator]"},t.keys=function(t){var r=[];for(var e in t)r.push(e);return r.reverse(),function e(){for(;r.length;){var n=r.pop();if(n in t)return e.value=n,e.done=!1,e}return e.done=!0,e}},t.values=P,L.prototype={constructor:L,reset:function(t){if(this.prev=0,this.next=0,this.sent=this._sent=r,this.done=!1,this.delegate=null,this.method="next",this.arg=r,this.tryEntries.forEach(E),!t)for(var e in this)"t"===e.charAt(0)&&n.call(this,e)&&!isNaN(+e.slice(1))&&(this[e]=r)},stop:function(){this.done=!0;var t=this.tryEntries[0].completion;if("throw"===t.type)throw t.arg;return this.rval},dispatchException:function(t){if(this.done)throw t;var e=this;function o(n,o){return i.type="throw",i.arg=t,e.next=n,o&&(e.method="next",e.arg=r),!!o}for(var u=this.tryEntries.length-1;u>=0;--u){var a=this.tryEntries[u],i=a.completion;if("root"===a.tryLoc)return o("end");if(a.tryLoc<=this.prev){var c=n.call(a,"catchLoc"),f=n.call(a,"finallyLoc");if(c&&f){if(this.prev<a.catchLoc)return o(a.catchLoc,!0);if(this.prev<a.finallyLoc)return o(a.finallyLoc)}else if(c){if(this.prev<a.catchLoc)return o(a.catchLoc,!0)}else{if(!f)throw new Error("try statement without catch or finally");if(this.prev<a.finallyLoc)return o(a.finallyLoc)}}}},abrupt:function(t,r){for(var e=this.tryEntries.length-1;e>=0;--e){var o=this.tryEntries[e];if(o.tryLoc<=this.prev&&n.call(o,"finallyLoc")&&this.prev<o.finallyLoc){var u=o;break}}u&&("break"===t||"continue"===t)&&u.tryLoc<=r&&r<=u.finallyLoc&&(u=null);var a=u?u.completion:{};return a.type=t,a.arg=r,u?(this.method="next",this.next=u.finallyLoc,y):this.complete(a)},complete:function(t,r){if("throw"===t.type)throw t.arg;return"break"===t.type||"continue"===t.type?this.next=t.arg:"return"===t.type?(this.rval=this.arg=t.arg,this.method="return",this.next="end"):"normal"===t.type&&r&&(this.next=r),y},finish:function(t){for(var r=this.tryEntries.length-1;r>=0;--r){var e=this.tryEntries[r];if(e.finallyLoc===t)return this.complete(e.completion,e.afterLoc),E(e),y}},catch:function(t){for(var r=this.tryEntries.length-1;r>=0;--r){var e=this.tryEntries[r];if(e.tryLoc===t){var n=e.completion;if("throw"===n.type){var o=n.arg;E(e)}return o}}throw new Error("illegal catch attempt")},delegateYield:function(t,e,n){return this.delegate={iterator:P(t),resultName:e,nextLoc:n},"next"===this.method&&(this.arg=r),y}},t}(t.exports);try{regeneratorRuntime=r}catch(t){Function("r","regeneratorRuntime = r")(r)}}));function s(t,r,e,n,o,u,a){try{var i=t[u](a),c=i.value}catch(t){return void e(t)}i.done?r(c):Promise.resolve(c).then(n,o)}var v=function(t){return function(){var r=this,e=arguments;return new Promise((function(n,o){var u=t.apply(r,e);function a(t){s(u,n,o,a,i,"next",t)}function i(t){s(u,n,o,a,i,"throw",t)}a(void 0)}))}};var p=function(){this.__data__=[],this.size=0};var h=function(t,r){return t===r||t!=t&&r!=r};var d=function(t,r){for(var e=t.length;e--;)if(h(t[e][0],r))return e;return-1},y=Array.prototype.splice;var b=function(t){var r=this.__data__,e=d(r,t);return!(e<0)&&(e==r.length-1?r.pop():y.call(r,e,1),--this.size,!0)};var g=function(t){var r=this.__data__,e=d(r,t);return e<0?void 0:r[e][1]};var j=function(t){return d(this.__data__,t)>-1};var w=function(t,r){var e=this.__data__,n=d(e,t);return n<0?(++this.size,e.push([t,r])):e[n][1]=r,this};function m(t){var r=-1,e=null==t?0:t.length;for(this.clear();++r<e;){var n=t[r];this.set(n[0],n[1])}}m.prototype.clear=p,m.prototype.delete=b,m.prototype.get=g,m.prototype.has=j,m.prototype.set=w;var _=m;var O=function(){this.__data__=new _,this.size=0};var x=function(t){var r=this.__data__,e=r.delete(t);return this.size=r.size,e};var A=function(t){return this.__data__.get(t)};var S=function(t){return this.__data__.has(t)},k="object"==f(i)&&i&&i.Object===Object&&i,E="object"==("undefined"==typeof self?"undefined":f(self))&&self&&self.Object===Object&&self,L=k||E||Function("return this")(),P=L.Symbol,z=Object.prototype,F=z.hasOwnProperty,N=z.toString,B=P?P.toStringTag:void 0;var I=function(t){var r=F.call(t,B),e=t[B];try{t[B]=void 0;var n=!0}catch(t){}var o=N.call(t);return n&&(r?t[B]=e:delete t[B]),o},G=Object.prototype.toString;var M=function(t){return G.call(t)},T=P?P.toStringTag:void 0;var U=function(t){return null==t?void 0===t?"[object Undefined]":"[object Null]":T&&T in Object(t)?I(t):M(t)};var D=function(t){var r=f(t);return null!=t&&("object"==r||"function"==r)};var $,R=function(t){if(!D(t))return!1;var r=U(t);return"[object Function]"==r||"[object GeneratorFunction]"==r||"[object AsyncFunction]"==r||"[object Proxy]"==r},C=L["__core-js_shared__"],q=($=/[^.]+$/.exec(C&&C.keys&&C.keys.IE_PROTO||""))?"Symbol(src)_1."+$:"";var V=function(t){return!!q&&q in t},W=Function.prototype.toString;var Y=function(t){if(null!=t){try{return W.call(t)}catch(t){}try{return t+""}catch(t){}}return""},H=/^\[object .+?Constructor\]$/,J=Function.prototype,K=Object.prototype,Q=J.toString,X=K.hasOwnProperty,Z=RegExp("^"+Q.call(X).replace(/[\\^$.*+?()[\]{}|]/g,"\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g,"$1.*?")+"$");var tt=function(t){return!(!D(t)||V(t))&&(R(t)?Z:H).test(Y(t))};var rt=function(t,r){return null==t?void 0:t[r]};var et=function(t,r){var e=rt(t,r);return tt(e)?e:void 0},nt=et(L,"Map"),ot=et(Object,"create");var ut=function(){this.__data__=ot?ot(null):{},this.size=0};var at=function(t){var r=this.has(t)&&delete this.__data__[t];return this.size-=r?1:0,r},it=Object.prototype.hasOwnProperty;var ct=function(t){var r=this.__data__;if(ot){var e=r[t];return"__lodash_hash_undefined__"===e?void 0:e}return it.call(r,t)?r[t]:void 0},ft=Object.prototype.hasOwnProperty;var lt=function(t){var r=this.__data__;return ot?void 0!==r[t]:ft.call(r,t)};var st=function(t,r){var e=this.__data__;return this.size+=this.has(t)?0:1,e[t]=ot&&void 0===r?"__lodash_hash_undefined__":r,this};function vt(t){var r=-1,e=null==t?0:t.length;for(this.clear();++r<e;){var n=t[r];this.set(n[0],n[1])}}vt.prototype.clear=ut,vt.prototype.delete=at,vt.prototype.get=ct,vt.prototype.has=lt,vt.prototype.set=st;var pt=vt;var ht=function(){this.size=0,this.__data__={hash:new pt,map:new(nt||_),string:new pt}};var dt=function(t){var r=f(t);return"string"==r||"number"==r||"symbol"==r||"boolean"==r?"__proto__"!==t:null===t};var yt=function(t,r){var e=t.__data__;return dt(r)?e["string"==typeof r?"string":"hash"]:e.map};var bt=function(t){var r=yt(this,t).delete(t);return this.size-=r?1:0,r};var gt=function(t){return yt(this,t).get(t)};var jt=function(t){return yt(this,t).has(t)};var wt=function(t,r){var e=yt(this,t),n=e.size;return e.set(t,r),this.size+=e.size==n?0:1,this};function mt(t){var r=-1,e=null==t?0:t.length;for(this.clear();++r<e;){var n=t[r];this.set(n[0],n[1])}}mt.prototype.clear=ht,mt.prototype.delete=bt,mt.prototype.get=gt,mt.prototype.has=jt,mt.prototype.set=wt;var _t=mt;var Ot=function(t,r){var e=this.__data__;if(e instanceof _){var n=e.__data__;if(!nt||n.length<199)return n.push([t,r]),this.size=++e.size,this;e=this.__data__=new _t(n)}return e.set(t,r),this.size=e.size,this};function xt(t){var r=this.__data__=new _(t);this.size=r.size}xt.prototype.clear=O,xt.prototype.delete=x,xt.prototype.get=A,xt.prototype.has=S,xt.prototype.set=Ot;var At=xt;var St=function(t,r){for(var e=-1,n=null==t?0:t.length;++e<n&&!1!==r(t[e],e,t););return t},kt=function(){try{var t=et(Object,"defineProperty");return t({},"",{}),t}catch(t){}}();var Et=function(t,r,e){"__proto__"==r&&kt?kt(t,r,{configurable:!0,enumerable:!0,value:e,writable:!0}):t[r]=e},Lt=Object.prototype.hasOwnProperty;var Pt=function(t,r,e){var n=t[r];Lt.call(t,r)&&h(n,e)&&(void 0!==e||r in t)||Et(t,r,e)};var zt=function(t,r,e,n){var o=!e;e||(e={});for(var u=-1,a=r.length;++u<a;){var i=r[u],c=n?n(e[i],t[i],i,e,t):void 0;void 0===c&&(c=t[i]),o?Et(e,i,c):Pt(e,i,c)}return e};var Ft=function(t,r){for(var e=-1,n=Array(t);++e<t;)n[e]=r(e);return n};var Nt=function(t){return null!=t&&"object"==f(t)};var Bt=function(t){return Nt(t)&&"[object Arguments]"==U(t)},It=Object.prototype,Gt=It.hasOwnProperty,Mt=It.propertyIsEnumerable,Tt=Bt(function(){return arguments}())?Bt:function(t){return Nt(t)&&Gt.call(t,"callee")&&!Mt.call(t,"callee")},Ut=Array.isArray;var Dt=function(){return!1},$t=c((function(t,r){var e=r&&!r.nodeType&&r,n=e&&t&&!t.nodeType&&t,o=n&&n.exports===e?L.Buffer:void 0,u=(o?o.isBuffer:void 0)||Dt;t.exports=u})),Rt=/^(?:0|[1-9]\d*)$/;var Ct=function(t,r){var e=f(t);return!!(r=null==r?9007199254740991:r)&&("number"==e||"symbol"!=e&&Rt.test(t))&&t>-1&&t%1==0&&t<r};var qt=function(t){return"number"==typeof t&&t>-1&&t%1==0&&t<=9007199254740991},Vt={};Vt["[object Float32Array]"]=Vt["[object Float64Array]"]=Vt["[object Int8Array]"]=Vt["[object Int16Array]"]=Vt["[object Int32Array]"]=Vt["[object Uint8Array]"]=Vt["[object Uint8ClampedArray]"]=Vt["[object Uint16Array]"]=Vt["[object Uint32Array]"]=!0,Vt["[object Arguments]"]=Vt["[object Array]"]=Vt["[object ArrayBuffer]"]=Vt["[object Boolean]"]=Vt["[object DataView]"]=Vt["[object Date]"]=Vt["[object Error]"]=Vt["[object Function]"]=Vt["[object Map]"]=Vt["[object Number]"]=Vt["[object Object]"]=Vt["[object RegExp]"]=Vt["[object Set]"]=Vt["[object String]"]=Vt["[object WeakMap]"]=!1;var Wt=function(t){return Nt(t)&&qt(t.length)&&!!Vt[U(t)]};var Yt=function(t){return function(r){return t(r)}},Ht=c((function(t,r){var e=r&&!r.nodeType&&r,n=e&&t&&!t.nodeType&&t,o=n&&n.exports===e&&k.process,u=function(){try{var t=n&&n.require&&n.require("util").types;return t||o&&o.binding&&o.binding("util")}catch(t){}}();t.exports=u})),Jt=Ht&&Ht.isTypedArray,Kt=Jt?Yt(Jt):Wt,Qt=Object.prototype.hasOwnProperty;var Xt=function(t,r){var e=Ut(t),n=!e&&Tt(t),o=!e&&!n&&$t(t),u=!e&&!n&&!o&&Kt(t),a=e||n||o||u,i=a?Ft(t.length,String):[],c=i.length;for(var f in t)!r&&!Qt.call(t,f)||a&&("length"==f||o&&("offset"==f||"parent"==f)||u&&("buffer"==f||"byteLength"==f||"byteOffset"==f)||Ct(f,c))||i.push(f);return i},Zt=Object.prototype;var tr=function(t){var r=t&&t.constructor;return t===("function"==typeof r&&r.prototype||Zt)};var rr=function(t,r){return function(e){return t(r(e))}},er=rr(Object.keys,Object),nr=Object.prototype.hasOwnProperty;var or=function(t){if(!tr(t))return er(t);var r=[];for(var e in Object(t))nr.call(t,e)&&"constructor"!=e&&r.push(e);return r};var ur=function(t){return null!=t&&qt(t.length)&&!R(t)};var ar=function(t){return ur(t)?Xt(t):or(t)};var ir=function(t,r){return t&&zt(r,ar(r),t)};var cr=function(t){var r=[];if(null!=t)for(var e in Object(t))r.push(e);return r},fr=Object.prototype.hasOwnProperty;var lr=function(t){if(!D(t))return cr(t);var r=tr(t),e=[];for(var n in t)("constructor"!=n||!r&&fr.call(t,n))&&e.push(n);return e};var sr=function(t){return ur(t)?Xt(t,!0):lr(t)};var vr=function(t,r){return t&&zt(r,sr(r),t)},pr=c((function(t,r){var e=r&&!r.nodeType&&r,n=e&&t&&!t.nodeType&&t,o=n&&n.exports===e?L.Buffer:void 0,u=o?o.allocUnsafe:void 0;t.exports=function(t,r){if(r)return t.slice();var e=t.length,n=u?u(e):new t.constructor(e);return t.copy(n),n}}));var hr=function(t,r){var e=-1,n=t.length;for(r||(r=Array(n));++e<n;)r[e]=t[e];return r};var dr=function(t,r){for(var e=-1,n=null==t?0:t.length,o=0,u=[];++e<n;){var a=t[e];r(a,e,t)&&(u[o++]=a)}return u};var yr=function(){return[]},br=Object.prototype.propertyIsEnumerable,gr=Object.getOwnPropertySymbols,jr=gr?function(t){return null==t?[]:(t=Object(t),dr(gr(t),(function(r){return br.call(t,r)})))}:yr;var wr=function(t,r){return zt(t,jr(t),r)};var mr=function(t,r){for(var e=-1,n=r.length,o=t.length;++e<n;)t[o+e]=r[e];return t},_r=rr(Object.getPrototypeOf,Object),Or=Object.getOwnPropertySymbols?function(t){for(var r=[];t;)mr(r,jr(t)),t=_r(t);return r}:yr;var xr=function(t,r){return zt(t,Or(t),r)};var Ar=function(t,r,e){var n=r(t);return Ut(t)?n:mr(n,e(t))};var Sr=function(t){return Ar(t,ar,jr)};var kr=function(t){return Ar(t,sr,Or)},Er=et(L,"DataView"),Lr=et(L,"Promise"),Pr=et(L,"Set"),zr=et(L,"WeakMap"),Fr="[object Map]",Nr="[object Promise]",Br="[object Set]",Ir="[object WeakMap]",Gr="[object DataView]",Mr=Y(Er),Tr=Y(nt),Ur=Y(Lr),Dr=Y(Pr),$r=Y(zr),Rr=U;(Er&&Rr(new Er(new ArrayBuffer(1)))!=Gr||nt&&Rr(new nt)!=Fr||Lr&&Rr(Lr.resolve())!=Nr||Pr&&Rr(new Pr)!=Br||zr&&Rr(new zr)!=Ir)&&(Rr=function(t){var r=U(t),e="[object Object]"==r?t.constructor:void 0,n=e?Y(e):"";if(n)switch(n){case Mr:return Gr;case Tr:return Fr;case Ur:return Nr;case Dr:return Br;case $r:return Ir}return r});var Cr=Rr,qr=Object.prototype.hasOwnProperty;var Vr=function(t){var r=t.length,e=new t.constructor(r);return r&&"string"==typeof t[0]&&qr.call(t,"index")&&(e.index=t.index,e.input=t.input),e},Wr=L.Uint8Array;var Yr=function(t){var r=new t.constructor(t.byteLength);return new Wr(r).set(new Wr(t)),r};var Hr=function(t,r){var e=r?Yr(t.buffer):t.buffer;return new t.constructor(e,t.byteOffset,t.byteLength)},Jr=/\w*$/;var Kr=function(t){var r=new t.constructor(t.source,Jr.exec(t));return r.lastIndex=t.lastIndex,r},Qr=P?P.prototype:void 0,Xr=Qr?Qr.valueOf:void 0;var Zr=function(t){return Xr?Object(Xr.call(t)):{}};var te=function(t,r){var e=r?Yr(t.buffer):t.buffer;return new t.constructor(e,t.byteOffset,t.length)};var re=function(t,r,e){var n=t.constructor;switch(r){case"[object ArrayBuffer]":return Yr(t);case"[object Boolean]":case"[object Date]":return new n(+t);case"[object DataView]":return Hr(t,e);case"[object Float32Array]":case"[object Float64Array]":case"[object Int8Array]":case"[object Int16Array]":case"[object Int32Array]":case"[object Uint8Array]":case"[object Uint8ClampedArray]":case"[object Uint16Array]":case"[object Uint32Array]":return te(t,e);case"[object Map]":return new n;case"[object Number]":case"[object String]":return new n(t);case"[object RegExp]":return Kr(t);case"[object Set]":return new n;case"[object Symbol]":return Zr(t)}},ee=Object.create,ne=function(){function t(){}return function(r){if(!D(r))return{};if(ee)return ee(r);t.prototype=r;var e=new t;return t.prototype=void 0,e}}();var oe=function(t){return"function"!=typeof t.constructor||tr(t)?{}:ne(_r(t))};var ue=function(t){return Nt(t)&&"[object Map]"==Cr(t)},ae=Ht&&Ht.isMap,ie=ae?Yt(ae):ue;var ce=function(t){return Nt(t)&&"[object Set]"==Cr(t)},fe=Ht&&Ht.isSet,le=fe?Yt(fe):ce,se="[object Arguments]",ve="[object Function]",pe="[object Object]",he={};he[se]=he["[object Array]"]=he["[object ArrayBuffer]"]=he["[object DataView]"]=he["[object Boolean]"]=he["[object Date]"]=he["[object Float32Array]"]=he["[object Float64Array]"]=he["[object Int8Array]"]=he["[object Int16Array]"]=he["[object Int32Array]"]=he["[object Map]"]=he["[object Number]"]=he[pe]=he["[object RegExp]"]=he["[object Set]"]=he["[object String]"]=he["[object Symbol]"]=he["[object Uint8Array]"]=he["[object Uint8ClampedArray]"]=he["[object Uint16Array]"]=he["[object Uint32Array]"]=!0,he["[object Error]"]=he[ve]=he["[object WeakMap]"]=!1;var de=function t(r,e,n,o,u,a){var i,c=1&e,f=2&e,l=4&e;if(n&&(i=u?n(r,o,u,a):n(r)),void 0!==i)return i;if(!D(r))return r;var s=Ut(r);if(s){if(i=Vr(r),!c)return hr(r,i)}else{var v=Cr(r),p=v==ve||"[object GeneratorFunction]"==v;if($t(r))return pr(r,c);if(v==pe||v==se||p&&!u){if(i=f||p?{}:oe(r),!c)return f?xr(r,vr(i,r)):wr(r,ir(i,r))}else{if(!he[v])return u?r:{};i=re(r,v,c)}}a||(a=new At);var h=a.get(r);if(h)return h;a.set(r,i),le(r)?r.forEach((function(o){i.add(t(o,e,n,o,r,a))})):ie(r)&&r.forEach((function(o,u){i.set(u,t(o,e,n,u,r,a))}));var d=s?void 0:(l?f?kr:Sr:f?sr:ar)(r);return St(d||r,(function(o,u){d&&(o=r[u=o]),Pt(i,u,t(o,e,n,u,r,a))})),i};var ye=function(t){return de(t,5)};var be=function(t){return"symbol"==f(t)||Nt(t)&&"[object Symbol]"==U(t)},ge=/\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,je=/^\w*$/;var we=function(t,r){if(Ut(t))return!1;var e=f(t);return!("number"!=e&&"symbol"!=e&&"boolean"!=e&&null!=t&&!be(t))||(je.test(t)||!ge.test(t)||null!=r&&t in Object(r))};function me(t,r){if("function"!=typeof t||null!=r&&"function"!=typeof r)throw new TypeError("Expected a function");var e=function e(){var n=arguments,o=r?r.apply(this,n):n[0],u=e.cache;if(u.has(o))return u.get(o);var a=t.apply(this,n);return e.cache=u.set(o,a)||u,a};return e.cache=new(me.Cache||_t),e}me.Cache=_t;var _e=me;var Oe=/[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g,xe=/\\(\\)?/g,Ae=function(t){var r=_e(t,(function(t){return 500===e.size&&e.clear(),t})),e=r.cache;return r}((function(t){var r=[];return 46===t.charCodeAt(0)&&r.push(""),t.replace(Oe,(function(t,e,n,o){r.push(n?o.replace(xe,"$1"):e||t)})),r}));var Se=function(t,r){for(var e=-1,n=null==t?0:t.length,o=Array(n);++e<n;)o[e]=r(t[e],e,t);return o},ke=P?P.prototype:void 0,Ee=ke?ke.toString:void 0;var Le=function t(r){if("string"==typeof r)return r;if(Ut(r))return Se(r,t)+"";if(be(r))return Ee?Ee.call(r):"";var e=r+"";return"0"==e&&1/r==-Infinity?"-0":e};var Pe=function(t){return null==t?"":Le(t)};var ze=function(t,r){return Ut(t)?t:we(t,r)?[t]:Ae(Pe(t))};var Fe=function(t){if("string"==typeof t||be(t))return t;var r=t+"";return"0"==r&&1/t==-Infinity?"-0":r};var Ne=function(t,r){for(var e=0,n=(r=ze(r,t)).length;null!=t&&e<n;)t=t[Fe(r[e++])];return e&&e==n?t:void 0};var Be=function(t,r,e){var n=null==t?void 0:Ne(t,r);return void 0===n?e:n};var Ie=function(t){return this.__data__.set(t,"__lodash_hash_undefined__"),this};var Ge=function(t){return this.__data__.has(t)};function Me(t){var r=-1,e=null==t?0:t.length;for(this.__data__=new _t;++r<e;)this.add(t[r])}Me.prototype.add=Me.prototype.push=Ie,Me.prototype.has=Ge;var Te=Me;var Ue=function(t,r){for(var e=-1,n=null==t?0:t.length;++e<n;)if(r(t[e],e,t))return!0;return!1};var De=function(t,r){return t.has(r)};var $e=function(t,r,e,n,o,u){var a=1&e,i=t.length,c=r.length;if(i!=c&&!(a&&c>i))return!1;var f=u.get(t),l=u.get(r);if(f&&l)return f==r&&l==t;var s=-1,v=!0,p=2&e?new Te:void 0;for(u.set(t,r),u.set(r,t);++s<i;){var h=t[s],d=r[s];if(n)var y=a?n(d,h,s,r,t,u):n(h,d,s,t,r,u);if(void 0!==y){if(y)continue;v=!1;break}if(p){if(!Ue(r,(function(t,r){if(!De(p,r)&&(h===t||o(h,t,e,n,u)))return p.push(r)}))){v=!1;break}}else if(h!==d&&!o(h,d,e,n,u)){v=!1;break}}return u.delete(t),u.delete(r),v};var Re=function(t){var r=-1,e=Array(t.size);return t.forEach((function(t,n){e[++r]=[n,t]})),e};var Ce=function(t){var r=-1,e=Array(t.size);return t.forEach((function(t){e[++r]=t})),e},qe=P?P.prototype:void 0,Ve=qe?qe.valueOf:void 0;var We=function(t,r,e,n,o,u,a){switch(e){case"[object DataView]":if(t.byteLength!=r.byteLength||t.byteOffset!=r.byteOffset)return!1;t=t.buffer,r=r.buffer;case"[object ArrayBuffer]":return!(t.byteLength!=r.byteLength||!u(new Wr(t),new Wr(r)));case"[object Boolean]":case"[object Date]":case"[object Number]":return h(+t,+r);case"[object Error]":return t.name==r.name&&t.message==r.message;case"[object RegExp]":case"[object String]":return t==r+"";case"[object Map]":var i=Re;case"[object Set]":var c=1&n;if(i||(i=Ce),t.size!=r.size&&!c)return!1;var f=a.get(t);if(f)return f==r;n|=2,a.set(t,r);var l=$e(i(t),i(r),n,o,u,a);return a.delete(t),l;case"[object Symbol]":if(Ve)return Ve.call(t)==Ve.call(r)}return!1},Ye=Object.prototype.hasOwnProperty;var He=function(t,r,e,n,o,u){var a=1&e,i=Sr(t),c=i.length;if(c!=Sr(r).length&&!a)return!1;for(var f=c;f--;){var l=i[f];if(!(a?l in r:Ye.call(r,l)))return!1}var s=u.get(t),v=u.get(r);if(s&&v)return s==r&&v==t;var p=!0;u.set(t,r),u.set(r,t);for(var h=a;++f<c;){var d=t[l=i[f]],y=r[l];if(n)var b=a?n(y,d,l,r,t,u):n(d,y,l,t,r,u);if(!(void 0===b?d===y||o(d,y,e,n,u):b)){p=!1;break}h||(h="constructor"==l)}if(p&&!h){var g=t.constructor,j=r.constructor;g==j||!("constructor"in t)||!("constructor"in r)||"function"==typeof g&&g instanceof g&&"function"==typeof j&&j instanceof j||(p=!1)}return u.delete(t),u.delete(r),p},Je="[object Arguments]",Ke="[object Array]",Qe="[object Object]",Xe=Object.prototype.hasOwnProperty;var Ze=function(t,r,e,n,o,u){var a=Ut(t),i=Ut(r),c=a?Ke:Cr(t),f=i?Ke:Cr(r),l=(c=c==Je?Qe:c)==Qe,s=(f=f==Je?Qe:f)==Qe,v=c==f;if(v&&$t(t)){if(!$t(r))return!1;a=!0,l=!1}if(v&&!l)return u||(u=new At),a||Kt(t)?$e(t,r,e,n,o,u):We(t,r,c,e,n,o,u);if(!(1&e)){var p=l&&Xe.call(t,"__wrapped__"),h=s&&Xe.call(r,"__wrapped__");if(p||h){var d=p?t.value():t,y=h?r.value():r;return u||(u=new At),o(d,y,e,n,u)}}return!!v&&(u||(u=new At),He(t,r,e,n,o,u))};var tn=function t(r,e,n,o,u){return r===e||(null==r||null==e||!Nt(r)&&!Nt(e)?r!=r&&e!=e:Ze(r,e,n,o,t,u))};var rn=function(t,r,e,n){var o=e.length,u=o,a=!n;if(null==t)return!u;for(t=Object(t);o--;){var i=e[o];if(a&&i[2]?i[1]!==t[i[0]]:!(i[0]in t))return!1}for(;++o<u;){var c=(i=e[o])[0],f=t[c],l=i[1];if(a&&i[2]){if(void 0===f&&!(c in t))return!1}else{var s=new At;if(n)var v=n(f,l,c,t,r,s);if(!(void 0===v?tn(l,f,3,n,s):v))return!1}}return!0};var en=function(t){return t==t&&!D(t)};var nn=function(t){for(var r=ar(t),e=r.length;e--;){var n=r[e],o=t[n];r[e]=[n,o,en(o)]}return r};var on=function(t,r){return function(e){return null!=e&&(e[t]===r&&(void 0!==r||t in Object(e)))}};var un=function(t){var r=nn(t);return 1==r.length&&r[0][2]?on(r[0][0],r[0][1]):function(e){return e===t||rn(e,t,r)}};var an=function(t,r){return null!=t&&r in Object(t)};var cn=function(t,r,e){for(var n=-1,o=(r=ze(r,t)).length,u=!1;++n<o;){var a=Fe(r[n]);if(!(u=null!=t&&e(t,a)))break;t=t[a]}return u||++n!=o?u:!!(o=null==t?0:t.length)&&qt(o)&&Ct(a,o)&&(Ut(t)||Tt(t))};var fn=function(t,r){return null!=t&&cn(t,r,an)};var ln=function(t,r){return we(t)&&en(r)?on(Fe(t),r):function(e){var n=Be(e,t);return void 0===n&&n===r?fn(e,t):tn(r,n,3)}};var sn=function(t){return t};var vn=function(t){return function(r){return null==r?void 0:r[t]}};var pn=function(t){return function(r){return Ne(r,t)}};var hn=function(t){return we(t)?vn(Fe(t)):pn(t)};var dn=function(t){return"function"==typeof t?t:null==t?sn:"object"==f(t)?Ut(t)?ln(t[0],t[1]):un(t):hn(t)};var yn=function(t){return function(r,e,n){for(var o=-1,u=Object(r),a=n(r),i=a.length;i--;){var c=a[t?i:++o];if(!1===e(u[c],c,u))break}return r}}();var bn=function(t,r){return function(e,n){if(null==e)return e;if(!ur(e))return t(e,n);for(var o=e.length,u=r?o:-1,a=Object(e);(r?u--:++u<o)&&!1!==n(a[u],u,a););return e}}((function(t,r){return t&&yn(t,r,ar)}));var gn=function(t,r){var e=-1,n=ur(t)?Array(t.length):[];return bn(t,(function(t,o,u){n[++e]=r(t,o,u)})),n};var jn=function(t,r){return(Ut(t)?Se:gn)(t,dn(r))};var wn=function(t){var r=null==t?0:t.length;return r?t[r-1]:void 0};var mn=function(t,r,e){var n=-1,o=t.length;r<0&&(r=-r>o?0:o+r),(e=e>o?o:e)<0&&(e+=o),o=r>e?0:e-r>>>0,r>>>=0;for(var u=Array(o);++n<o;)u[n]=t[n+r];return u};var _n=function(t,r){return r.length<2?t:Ne(t,mn(r,0,-1))};var On=function(t,r){return r=ze(r,t),null==(t=_n(t,r))||delete t[Fe(wn(r))]},xn=Function.prototype,An=Object.prototype,Sn=xn.toString,kn=An.hasOwnProperty,En=Sn.call(Object);var Ln=function(t){if(!Nt(t)||"[object Object]"!=U(t))return!1;var r=_r(t);if(null===r)return!0;var e=kn.call(r,"constructor")&&r.constructor;return"function"==typeof e&&e instanceof e&&Sn.call(e)==En};var Pn=function(t){return Ln(t)?void 0:t},zn=P?P.isConcatSpreadable:void 0;var Fn=function(t){return Ut(t)||Tt(t)||!!(zn&&t&&t[zn])};var Nn=function t(r,e,n,o,u){var a=-1,i=r.length;for(n||(n=Fn),u||(u=[]);++a<i;){var c=r[a];e>0&&n(c)?e>1?t(c,e-1,n,o,u):mr(u,c):o||(u[u.length]=c)}return u};var Bn=function(t){return(null==t?0:t.length)?Nn(t,1):[]};var In=function(t,r,e){switch(e.length){case 0:return t.call(r);case 1:return t.call(r,e[0]);case 2:return t.call(r,e[0],e[1]);case 3:return t.call(r,e[0],e[1],e[2])}return t.apply(r,e)},Gn=Math.max;var Mn=function(t,r,e){return r=Gn(void 0===r?t.length-1:r,0),function(){for(var n=arguments,o=-1,u=Gn(n.length-r,0),a=Array(u);++o<u;)a[o]=n[r+o];o=-1;for(var i=Array(r+1);++o<r;)i[o]=n[o];return i[r]=e(a),In(t,this,i)}};var Tn=function(t){return function(){return t}},Un=kt?function(t,r){return kt(t,"toString",{configurable:!0,enumerable:!1,value:Tn(r),writable:!0})}:sn,Dn=Date.now;var $n=function(t){var r=0,e=0;return function(){var n=Dn(),o=16-(n-e);if(e=n,o>0){if(++r>=800)return arguments[0]}else r=0;return t.apply(void 0,arguments)}}(Un);var Rn=function(t){return $n(Mn(t,void 0,Bn),t+"")}((function(t,r){var e={};if(null==t)return e;var n=!1;r=Se(r,(function(r){return r=ze(r,t),n||(n=r.length>1),r})),zt(t,kr(t),e),n&&(e=de(e,7,Pn));for(var o=r.length;o--;)On(e,r[o]);return e}));var Cn=function(t){return"string"==typeof t||!Ut(t)&&Nt(t)&&"[object String]"==U(t)},qn=vn("length"),Vn=RegExp("[\\u200d\\ud800-\\udfff\\u0300-\\u036f\\ufe20-\\ufe2f\\u20d0-\\u20ff\\ufe0e\\ufe0f]");var Wn=function(t){return Vn.test(t)},Yn="[\\ud800-\\udfff]",Hn="[\\u0300-\\u036f\\ufe20-\\ufe2f\\u20d0-\\u20ff]",Jn="\\ud83c[\\udffb-\\udfff]",Kn="[^\\ud800-\\udfff]",Qn="(?:\\ud83c[\\udde6-\\uddff]){2}",Xn="[\\ud800-\\udbff][\\udc00-\\udfff]",Zn="(?:"+Hn+"|"+Jn+")"+"?",to="[\\ufe0e\\ufe0f]?",ro=to+Zn+("(?:\\u200d(?:"+[Kn,Qn,Xn].join("|")+")"+to+Zn+")*"),eo="(?:"+[Kn+Hn+"?",Hn,Qn,Xn,Yn].join("|")+")",no=RegExp(Jn+"(?="+Jn+")|"+eo+ro,"g");var oo=function(t){for(var r=no.lastIndex=0;no.test(t);)++r;return r};var uo=function(t){return Wn(t)?oo(t):qn(t)};var ao=function(t){if(null==t)return 0;if(ur(t))return Cn(t)?uo(t):t.length;var r=Cr(t);return"[object Map]"==r||"[object Set]"==r?t.size:or(t).length};function io(){var t,r,e=new Promise((function(){t=arguments[0],r=arguments[1]}));return e.resolve=t,e.reject=r,e}var co=/^\s+|\s+$/g,fo=/^[-+]0x[0-9a-f]+$/i,lo=/^0b[01]+$/i,so=/^0o[0-7]+$/i,vo=parseInt;var po=function(t){if("number"==typeof t)return t;if(be(t))return NaN;if(D(t)){var r="function"==typeof t.valueOf?t.valueOf():t;t=D(r)?r+"":r}if("string"!=typeof t)return 0===t?t:+t;t=t.replace(co,"");var e=lo.test(t);return e||so.test(t)?vo(t.slice(2),e?2:8):fo.test(t)?NaN:+t},ho=1/0;var yo=function(t){return t?(t=po(t))===ho||t===-1/0?17976931348623157e292*(t<0?-1:1):t==t?t:0:0===t?t:0};var bo=function(t){var r=yo(t),e=r%1;return r==r?e?r-e:r:0};var go=function(t){return"number"==typeof t&&t==bo(t)};function jo(t){return!(!function(t){return"[object String]"===Object.prototype.toString.call(t)}(t)||""===t)}function wo(t){var r=!1;return jo(t)?r=!isNaN(Number(t)):function(t){return"[object Number]"===Object.prototype.toString.call(t)}(t)&&(r=!0),r}function mo(t){return wo(t)?yo(t):0}var _o=L.isFinite,Oo=Math.min;var xo=function(t){var r=Math[t];return function(t,e){if(t=po(t),(e=null==e?0:Oo(bo(e),292))&&_o(t)){var n=(Pe(t)+"e").split("e"),o=r(n[0]+"e"+(+n[1]+e));return+((n=(Pe(o)+"e").split("e"))[0]+"e"+(+n[1]-e))}return r(t)}}("round");function Ao(t){if(!wo(t))return 0;t=mo(t);var r=xo(t);return"0"===String(r)?0:r}function So(t){return!!function(t){return!!wo(t)&&(t=mo(t),go(t))}(t)&&Ao(t)>0}var ko="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split(""),Eo=ko.length;function Lo(){var t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:32,r=[];t=So(t)?Ao(t):32;for(var e=0;e<t;e++)r[e]=ko[0|Math.random()*Eo];var n=r.join("");return n}function Po(t){return"[object Array]"===Object.prototype.toString.call(t)}var zo=function(t,r,e){var n=null==t?0:t.length;return n?(r=e||void 0===r?1:bo(r),mn(t,r<0?0:r,n)):[]};function Fo(t){var r=Object.prototype.toString.call(t);return"[object Function]"===r||"[object AsyncFunction]"===r}function No(t,r){var e=io();if(!Po(t))return e.reject("rs is not array"),e;Fo(r)||(r=function(t){return t});var n=-1,o=[];return t.reduce((function(t,e){return t.then((function(t){return o.push(t),n+=1,Fo(r)?r(e,n):e}))}),Promise.resolve()).then((function(t){o.push(t),o=zo(o),e.resolve(o)})).catch((function(t){e.reject(t)})),e}var Bo={useNewUrlParser:!0,useUnifiedTopology:!0};return function(){var t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};t.url||(t.url="mongodb://127.0.0.1:27017"),t.db||(t.db="worm"),t.cl||(t.cl="test");var r=new o.default.EventEmitter,e=u.default.MongoClient;function n(){return i.apply(this,arguments)}function i(){return(i=v(l.mark((function r(){var n,o,u,a,i=arguments;return l.wrap((function(r){for(;;)switch(r.prev=r.next){case 0:return n=i.length>0&&void 0!==i[0]?i[0]:{},o=io(),r.next=4,e.connect(t.url,Bo);case 4:return u=r.sent,a=u.db(t.db),a.collection(t.cl).find(n).toArray((function(t,r){t?o.reject(t):(r=jn(r,(function(t){return t=Rn(t,"_id")})),o.resolve(r)),u.close()})),r.abrupt("return",o);case 9:case"end":return r.stop()}}),r)})))).apply(this,arguments)}function c(t){return f.apply(this,arguments)}function f(){return(f=v(l.mark((function n(o){var u,a,i,c;return l.wrap((function(n){for(;;)switch(n.prev=n.next){case 0:return o=ye(o),u=io(),n.next=4,e.connect(t.url,Bo);case 4:return a=n.sent,i=a.db(t.db),c=i.collection(t.cl),Po(o)||(o=[o]),o=jn(o,(function(t){return t.id||(t.id=Lo()),t})),c.insertMany(o,(function(t,e){t?u.reject(t):e.insertedCount>0?(e=e.result,u.resolve(e),r.emit("change","insert",o,e)):u.reject(t),a.close()})),n.abrupt("return",u);case 11:case"end":return n.stop()}}),n)})))).apply(this,arguments)}function s(t){return p.apply(this,arguments)}function p(){return(p=v(l.mark((function n(o){var u,a,i,f,s,v,p,h,d=arguments;return l.wrap((function(n){for(;;)switch(n.prev=n.next){case 0:return u=d.length>1&&void 0!==d[1]?d[1]:{},o=ye(o),a=Be(u,"autoInsert",!0),i=Be(u,"atomic",!1),f=io(),n.next=7,e.connect(t.url,Bo);case 7:return s=n.sent,v=s.db(t.db),p=v.collection(t.cl),Po(o)||(o=[o]),h=null,h=i?"findOneAndUpdate":"updateOne",No(o,(function(t){var r=io();return p[h]({id:t.id},{$set:t},(function(e,n){e?r.reject(e):(n.lastErrorObject&&(n.result={n:n.lastErrorObject.n,nModified:n.lastErrorObject.updatedExisting?1:0,ok:1}),a&&0===n.result.n?c(t).then((function(t){t.nInserted=1,r.resolve(t)})).catch((function(t){r.reject(t)})):r.resolve(n.result))})),r})).then((function(t){f.resolve(t),r.emit("change","save",o,t)})).catch((function(t){f.reject(t)})).finally((function(){s.close()})),n.abrupt("return",f);case 15:case"end":return n.stop()}}),n)})))).apply(this,arguments)}function h(t){return d.apply(this,arguments)}function d(){return(d=v(l.mark((function n(o){var u,a,i,c;return l.wrap((function(n){for(;;)switch(n.prev=n.next){case 0:return o=ye(o),u=io(),n.next=4,e.connect(t.url,Bo);case 4:return a=n.sent,i=a.db(t.db),c=i.collection(t.cl),Po(o)||(o=[o]),No(o,(function(t){var r=io();return c.deleteOne({id:t.id},(function(t,e){t?r.resolve(t):((e=e.result).nDeleted=1,r.resolve(e))})),r})).then((function(t){u.resolve(t),r.emit("change","del",o,t)})).catch((function(t){u.reject(t)})).finally((function(){a.close()})),n.abrupt("return",u);case 10:case"end":return n.stop()}}),n)})))).apply(this,arguments)}function y(){return b.apply(this,arguments)}function b(){return(b=v(l.mark((function n(){var o,u,a,i,c=arguments;return l.wrap((function(n){for(;;)switch(n.prev=n.next){case 0:return o=c.length>0&&void 0!==c[0]?c[0]:{},u=io(),n.next=4,e.connect(t.url,Bo);case 4:return a=n.sent,i=a.db(t.db),i.collection(t.cl).deleteMany(o,(function(t,e){t?u.resolve(t):(e=e.result,u.resolve(e),r.emit("change","delAll",null,e)),a.close()})),n.abrupt("return",u);case 9:case"end":return n.stop()}}),n)})))).apply(this,arguments)}function g(t){return j.apply(this,arguments)}function j(){return(j=v(l.mark((function n(o){var i,c,f,s,v,p,h;return l.wrap((function(n){for(;;)switch(n.prev=n.next){case 0:return i=io(),c=Lo(),f=Buffer.from(o),n.next=5,e.connect(t.url,Bo);case 5:return s=n.sent,v=s.db(t.db),p=new u.default.GridFSBucket(v,{chunkSizeBytes:10485760,bucketName:t.cl}),(h=new a.default.Readable)._read=function(){},h.push(f),h.push(null),h.pipe(p.openUploadStream(c)).on("error",(function(t){i.reject(t),s.close()})).on("finish",(function(){var t={n:1,ok:1,id:c};i.resolve(t),r.emit("change","insertGfs",null,t),s.close()})),n.abrupt("return",i);case 14:case"end":return n.stop()}}),n)})))).apply(this,arguments)}function w(t){return m.apply(this,arguments)}function m(){return(m=v(l.mark((function r(n){var o,a,i,c,f,s;return l.wrap((function(r){for(;;)switch(r.prev=r.next){case 0:return o=io(),r.next=3,e.connect(t.url,Bo);case 3:return a=r.sent,i=a.db(t.db),c=new u.default.GridFSBucket(i,{chunkSizeBytes:10485760,bucketName:t.cl}),f=Buffer.from(""),(s=c.openDownloadStreamByName(n)).on("data",(function(t){f=Buffer.concat([f,t])})),s.on("error",(function(t){o.reject(t),a.close()})),s.on("end",(function(){var t=new Uint8Array(f);f=null,o.resolve(t),a.close()})),r.abrupt("return",o);case 12:case"end":return r.stop()}}),r)})))).apply(this,arguments)}function _(){return O.apply(this,arguments)}function O(){return(O=v(l.mark((function r(){var n,o,a,i,c,f=arguments;return l.wrap((function(r){for(;;)switch(r.prev=r.next){case 0:if(n=f.length>0&&void 0!==f[0]?f[0]:{},o=f.length>1&&void 0!==f[1]?f[1]:null,a=io(),null!==o){r.next=9;break}return r.next=6,e.connect(t.url,Bo);case 6:i=r.sent,c=i.db(t.db),o=new u.default.GridFSBucket(c,{chunkSizeBytes:10485760,bucketName:t.cl});case 9:return o.find(n).toArray((function(t,r){t?a.reject(t):a.resolve(r)})),r.abrupt("return",a);case 11:case"end":return r.stop()}}),r)})))).apply(this,arguments)}function x(t){return A.apply(this,arguments)}function A(){return(A=v(l.mark((function n(o){var a,i,c,f,s,v;return l.wrap((function(n){for(;;)switch(n.prev=n.next){case 0:return a=io(),n.next=3,e.connect(t.url,Bo);case 3:return i=n.sent,c=i.db(t.db),f=new u.default.GridFSBucket(c,{chunkSizeBytes:10485760,bucketName:t.cl}),n.next=8,_({filename:o},f);case 8:return 0===(s=n.sent).length?(a.reject("can not find id"),i.close()):s.length>1?(a.reject("duplicate id"),i.close()):(v=s[0]._id,f.delete(v,(function(t){if(t)a.reject(t);else{var e={n:1,nDeleted:1,ok:1};a.resolve(e),r.emit("change","delGfs",null,e)}i.close()}))),n.abrupt("return",a);case 11:case"end":return n.stop()}}),n)})))).apply(this,arguments)}function S(t,r){return k.apply(this,arguments)}function k(){return(k=v(l.mark((function t(r,e){var n;return l.wrap((function(t){for(;;)switch(t.prev=t.next){case 0:return n=io(),e.delete(r,(function(t){t?n.reject(t):n.resolve({n:1,nDeleted:1,ok:1})})),t.abrupt("return",n);case 3:case"end":return t.stop()}}),t)})))).apply(this,arguments)}function E(){return L.apply(this,arguments)}function L(){return(L=v(l.mark((function n(){var o,a,i,c,f,s,v,p,h=arguments;return l.wrap((function(n){for(;;)switch(n.prev=n.next){case 0:return o=h.length>0&&void 0!==h[0]?h[0]:{},a=io(),n.next=4,e.connect(t.url,Bo);case 4:return i=n.sent,c=i.db(t.db),f=new u.default.GridFSBucket(c,{chunkSizeBytes:10485760,bucketName:t.cl}),n.next=9,_(o,f);case 9:return s=n.sent,v=ao(s),p=jn(s,(function(t){return S(t._id,f)})),Promise.all(p).then((function(t){var e={n:v,ok:1};a.resolve(e),r.emit("change","delAllGfs",null,e)})).catch((function(t){a.reject(t)})).finally((function(){i.close()})),n.abrupt("return",a);case 14:case"end":return n.stop()}}),n)})))).apply(this,arguments)}return r.select=n,r.insert=c,r.save=s,r.del=h,r.delAll=y,r.selectGfs=w,r.insertGfs=g,r.delGfs=x,r.delAllGfs=E,r}}));
//# sourceMappingURL=w-orm-mongodb.umd.js.map
