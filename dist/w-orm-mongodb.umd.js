/*!
 * w-orm-mongodb v1.1.32
 * (c) 2018-2021 yuda-lyu(semisphere)
 * Released under the MIT License.
 */
!function(t,e){"object"==typeof exports&&"undefined"!=typeof module?module.exports=e(require("events"),require("mongodb"),require("stream")):"function"==typeof define&&define.amd?define(["events","mongodb","stream"],e):(t="undefined"!=typeof globalThis?globalThis:t||self)["w-orm-mongodb"]=e(t.events,t.mongodb,t.stream)}(this,(function(t,e,r){"use strict";function n(t,e){return t===e||t!=t&&e!=e}function o(t,e){for(var r=t.length;r--;)if(n(t[r][0],e))return r;return-1}var u=Array.prototype.splice;function c(t){var e=-1,r=null==t?0:t.length;for(this.clear();++e<r;){var n=t[e];this.set(n[0],n[1])}}c.prototype.clear=function(){this.__data__=[],this.size=0},c.prototype.delete=function(t){var e=this.__data__,r=o(e,t);return!(r<0)&&(r==e.length-1?e.pop():u.call(e,r,1),--this.size,!0)},c.prototype.get=function(t){var e=this.__data__,r=o(e,t);return r<0?void 0:e[r][1]},c.prototype.has=function(t){return o(this.__data__,t)>-1},c.prototype.set=function(t,e){var r=this.__data__,n=o(r,t);return n<0?(++this.size,r.push([t,e])):r[n][1]=e,this};var i="object"==typeof global&&global&&global.Object===Object&&global,a="object"==typeof self&&self&&self.Object===Object&&self,l=i||a||Function("return this")(),f=l.Symbol,s=Object.prototype,v=s.hasOwnProperty,b=s.toString,p=f?f.toStringTag:void 0;var d=Object.prototype.toString;var y="[object Null]",h="[object Undefined]",j=f?f.toStringTag:void 0;function g(t){return null==t?void 0===t?h:y:j&&j in Object(t)?function(t){var e=v.call(t,p),r=t[p];try{t[p]=void 0;var n=!0}catch(t){}var o=b.call(t);return n&&(e?t[p]=r:delete t[p]),o}(t):function(t){return d.call(t)}(t)}function _(t){var e=typeof t;return null!=t&&("object"==e||"function"==e)}var w="[object AsyncFunction]",m="[object Function]",O="[object GeneratorFunction]",A="[object Proxy]";function S(t){if(!_(t))return!1;var e=g(t);return e==m||e==O||e==w||e==A}var k,x=l["__core-js_shared__"],P=(k=/[^.]+$/.exec(x&&x.keys&&x.keys.IE_PROTO||""))?"Symbol(src)_1."+k:"";var z=Function.prototype.toString;function B(t){if(null!=t){try{return z.call(t)}catch(t){}try{return t+""}catch(t){}}return""}var F=/^\[object .+?Constructor\]$/,M=Function.prototype,E=Object.prototype,I=M.toString,U=E.hasOwnProperty,D=RegExp("^"+I.call(U).replace(/[\\^$.*+?()[\]{}|]/g,"\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g,"$1.*?")+"$");function N(t){return!(!_(t)||(e=t,P&&P in e))&&(S(t)?D:F).test(B(t));var e}function $(t,e){var r=function(t,e){return null==t?void 0:t[e]}(t,e);return N(r)?r:void 0}var C=$(l,"Map"),G=$(Object,"create");var T=Object.prototype.hasOwnProperty;var R=Object.prototype.hasOwnProperty;function L(t){var e=-1,r=null==t?0:t.length;for(this.clear();++e<r;){var n=t[e];this.set(n[0],n[1])}}function V(t,e){var r,n,o=t.__data__;return("string"==(n=typeof(r=e))||"number"==n||"symbol"==n||"boolean"==n?"__proto__"!==r:null===r)?o["string"==typeof e?"string":"hash"]:o.map}function q(t){var e=-1,r=null==t?0:t.length;for(this.clear();++e<r;){var n=t[e];this.set(n[0],n[1])}}L.prototype.clear=function(){this.__data__=G?G(null):{},this.size=0},L.prototype.delete=function(t){var e=this.has(t)&&delete this.__data__[t];return this.size-=e?1:0,e},L.prototype.get=function(t){var e=this.__data__;if(G){var r=e[t];return"__lodash_hash_undefined__"===r?void 0:r}return T.call(e,t)?e[t]:void 0},L.prototype.has=function(t){var e=this.__data__;return G?void 0!==e[t]:R.call(e,t)},L.prototype.set=function(t,e){var r=this.__data__;return this.size+=this.has(t)?0:1,r[t]=G&&void 0===e?"__lodash_hash_undefined__":e,this},q.prototype.clear=function(){this.size=0,this.__data__={hash:new L,map:new(C||c),string:new L}},q.prototype.delete=function(t){var e=V(this,t).delete(t);return this.size-=e?1:0,e},q.prototype.get=function(t){return V(this,t).get(t)},q.prototype.has=function(t){return V(this,t).has(t)},q.prototype.set=function(t,e){var r=V(this,t),n=r.size;return r.set(t,e),this.size+=r.size==n?0:1,this};function W(t){var e=this.__data__=new c(t);this.size=e.size}function H(t,e){for(var r=-1,n=null==t?0:t.length;++r<n&&!1!==e(t[r],r,t););return t}W.prototype.clear=function(){this.__data__=new c,this.size=0},W.prototype.delete=function(t){var e=this.__data__,r=e.delete(t);return this.size=e.size,r},W.prototype.get=function(t){return this.__data__.get(t)},W.prototype.has=function(t){return this.__data__.has(t)},W.prototype.set=function(t,e){var r=this.__data__;if(r instanceof c){var n=r.__data__;if(!C||n.length<199)return n.push([t,e]),this.size=++r.size,this;r=this.__data__=new q(n)}return r.set(t,e),this.size=r.size,this};var J=function(){try{var t=$(Object,"defineProperty");return t({},"",{}),t}catch(t){}}(),K=J;function Q(t,e,r){"__proto__"==e&&K?K(t,e,{configurable:!0,enumerable:!0,value:r,writable:!0}):t[e]=r}var X=Object.prototype.hasOwnProperty;function Y(t,e,r){var o=t[e];X.call(t,e)&&n(o,r)&&(void 0!==r||e in t)||Q(t,e,r)}function Z(t,e,r,n){var o=!r;r||(r={});for(var u=-1,c=e.length;++u<c;){var i=e[u],a=n?n(r[i],t[i],i,r,t):void 0;void 0===a&&(a=t[i]),o?Q(r,i,a):Y(r,i,a)}return r}function tt(t){return null!=t&&"object"==typeof t}function et(t){return tt(t)&&"[object Arguments]"==g(t)}var rt=Object.prototype,nt=rt.hasOwnProperty,ot=rt.propertyIsEnumerable,ut=et(function(){return arguments}())?et:function(t){return tt(t)&&nt.call(t,"callee")&&!ot.call(t,"callee")},ct=ut,it=Array.isArray;var at="object"==typeof exports&&exports&&!exports.nodeType&&exports,lt=at&&"object"==typeof module&&module&&!module.nodeType&&module,ft=lt&&lt.exports===at?l.Buffer:void 0,st=(ft?ft.isBuffer:void 0)||function(){return!1},vt=9007199254740991,bt=/^(?:0|[1-9]\d*)$/;function pt(t,e){var r=typeof t;return!!(e=null==e?vt:e)&&("number"==r||"symbol"!=r&&bt.test(t))&&t>-1&&t%1==0&&t<e}var dt=9007199254740991;function yt(t){return"number"==typeof t&&t>-1&&t%1==0&&t<=dt}var ht={};function jt(t){return function(e){return t(e)}}ht["[object Float32Array]"]=ht["[object Float64Array]"]=ht["[object Int8Array]"]=ht["[object Int16Array]"]=ht["[object Int32Array]"]=ht["[object Uint8Array]"]=ht["[object Uint8ClampedArray]"]=ht["[object Uint16Array]"]=ht["[object Uint32Array]"]=!0,ht["[object Arguments]"]=ht["[object Array]"]=ht["[object ArrayBuffer]"]=ht["[object Boolean]"]=ht["[object DataView]"]=ht["[object Date]"]=ht["[object Error]"]=ht["[object Function]"]=ht["[object Map]"]=ht["[object Number]"]=ht["[object Object]"]=ht["[object RegExp]"]=ht["[object Set]"]=ht["[object String]"]=ht["[object WeakMap]"]=!1;var gt="object"==typeof exports&&exports&&!exports.nodeType&&exports,_t=gt&&"object"==typeof module&&module&&!module.nodeType&&module,wt=_t&&_t.exports===gt&&i.process,mt=function(){try{var t=_t&&_t.require&&_t.require("util").types;return t||wt&&wt.binding&&wt.binding("util")}catch(t){}}(),Ot=mt&&mt.isTypedArray,At=Ot?jt(Ot):function(t){return tt(t)&&yt(t.length)&&!!ht[g(t)]},St=Object.prototype.hasOwnProperty;function kt(t,e){var r=it(t),n=!r&&ct(t),o=!r&&!n&&st(t),u=!r&&!n&&!o&&At(t),c=r||n||o||u,i=c?function(t,e){for(var r=-1,n=Array(t);++r<t;)n[r]=e(r);return n}(t.length,String):[],a=i.length;for(var l in t)!e&&!St.call(t,l)||c&&("length"==l||o&&("offset"==l||"parent"==l)||u&&("buffer"==l||"byteLength"==l||"byteOffset"==l)||pt(l,a))||i.push(l);return i}var xt=Object.prototype;function Pt(t){var e=t&&t.constructor;return t===("function"==typeof e&&e.prototype||xt)}function zt(t,e){return function(r){return t(e(r))}}var Bt=zt(Object.keys,Object),Ft=Object.prototype.hasOwnProperty;function Mt(t){if(!Pt(t))return Bt(t);var e=[];for(var r in Object(t))Ft.call(t,r)&&"constructor"!=r&&e.push(r);return e}function Et(t){return null!=t&&yt(t.length)&&!S(t)}function It(t){return Et(t)?kt(t):Mt(t)}var Ut=Object.prototype.hasOwnProperty;function Dt(t){if(!_(t))return function(t){var e=[];if(null!=t)for(var r in Object(t))e.push(r);return e}(t);var e=Pt(t),r=[];for(var n in t)("constructor"!=n||!e&&Ut.call(t,n))&&r.push(n);return r}function Nt(t){return Et(t)?kt(t,!0):Dt(t)}var $t="object"==typeof exports&&exports&&!exports.nodeType&&exports,Ct=$t&&"object"==typeof module&&module&&!module.nodeType&&module,Gt=Ct&&Ct.exports===$t?l.Buffer:void 0,Tt=Gt?Gt.allocUnsafe:void 0;function Rt(){return[]}var Lt=Object.prototype.propertyIsEnumerable,Vt=Object.getOwnPropertySymbols,qt=Vt?function(t){return null==t?[]:(t=Object(t),function(t,e){for(var r=-1,n=null==t?0:t.length,o=0,u=[];++r<n;){var c=t[r];e(c,r,t)&&(u[o++]=c)}return u}(Vt(t),(function(e){return Lt.call(t,e)})))}:Rt,Wt=qt;function Ht(t,e){for(var r=-1,n=e.length,o=t.length;++r<n;)t[o+r]=e[r];return t}var Jt=zt(Object.getPrototypeOf,Object),Kt=Object.getOwnPropertySymbols?function(t){for(var e=[];t;)Ht(e,Wt(t)),t=Jt(t);return e}:Rt,Qt=Kt;function Xt(t,e,r){var n=e(t);return it(t)?n:Ht(n,r(t))}function Yt(t){return Xt(t,It,Wt)}function Zt(t){return Xt(t,Nt,Qt)}var te=$(l,"DataView"),ee=$(l,"Promise"),re=$(l,"Set"),ne=$(l,"WeakMap"),oe="[object Map]",ue="[object Promise]",ce="[object Set]",ie="[object WeakMap]",ae="[object DataView]",le=B(te),fe=B(C),se=B(ee),ve=B(re),be=B(ne),pe=g;(te&&pe(new te(new ArrayBuffer(1)))!=ae||C&&pe(new C)!=oe||ee&&pe(ee.resolve())!=ue||re&&pe(new re)!=ce||ne&&pe(new ne)!=ie)&&(pe=function(t){var e=g(t),r="[object Object]"==e?t.constructor:void 0,n=r?B(r):"";if(n)switch(n){case le:return ae;case fe:return oe;case se:return ue;case ve:return ce;case be:return ie}return e});var de=pe,ye=Object.prototype.hasOwnProperty;var he=l.Uint8Array;function je(t){var e=new t.constructor(t.byteLength);return new he(e).set(new he(t)),e}var ge=/\w*$/;var _e=f?f.prototype:void 0,we=_e?_e.valueOf:void 0;var me="[object Boolean]",Oe="[object Date]",Ae="[object Map]",Se="[object Number]",ke="[object RegExp]",xe="[object Set]",Pe="[object String]",ze="[object Symbol]",Be="[object ArrayBuffer]",Fe="[object DataView]",Me="[object Float32Array]",Ee="[object Float64Array]",Ie="[object Int8Array]",Ue="[object Int16Array]",De="[object Int32Array]",Ne="[object Uint8Array]",$e="[object Uint8ClampedArray]",Ce="[object Uint16Array]",Ge="[object Uint32Array]";function Te(t,e,r){var n,o,u,c=t.constructor;switch(e){case Be:return je(t);case me:case Oe:return new c(+t);case Fe:return function(t,e){var r=e?je(t.buffer):t.buffer;return new t.constructor(r,t.byteOffset,t.byteLength)}(t,r);case Me:case Ee:case Ie:case Ue:case De:case Ne:case $e:case Ce:case Ge:return function(t,e){var r=e?je(t.buffer):t.buffer;return new t.constructor(r,t.byteOffset,t.length)}(t,r);case Ae:return new c;case Se:case Pe:return new c(t);case ke:return(u=new(o=t).constructor(o.source,ge.exec(o))).lastIndex=o.lastIndex,u;case xe:return new c;case ze:return n=t,we?Object(we.call(n)):{}}}var Re=Object.create,Le=function(){function t(){}return function(e){if(!_(e))return{};if(Re)return Re(e);t.prototype=e;var r=new t;return t.prototype=void 0,r}}(),Ve=Le;var qe=mt&&mt.isMap,We=qe?jt(qe):function(t){return tt(t)&&"[object Map]"==de(t)};var He=mt&&mt.isSet,Je=He?jt(He):function(t){return tt(t)&&"[object Set]"==de(t)},Ke=1,Qe=2,Xe=4,Ye="[object Arguments]",Ze="[object Function]",tr="[object GeneratorFunction]",er="[object Object]",rr={};function nr(t,e,r,n,o,u){var c,i=e&Ke,a=e&Qe,l=e&Xe;if(r&&(c=o?r(t,n,o,u):r(t)),void 0!==c)return c;if(!_(t))return t;var f=it(t);if(f){if(c=function(t){var e=t.length,r=new t.constructor(e);return e&&"string"==typeof t[0]&&ye.call(t,"index")&&(r.index=t.index,r.input=t.input),r}(t),!i)return function(t,e){var r=-1,n=t.length;for(e||(e=Array(n));++r<n;)e[r]=t[r];return e}(t,c)}else{var s=de(t),v=s==Ze||s==tr;if(st(t))return function(t,e){if(e)return t.slice();var r=t.length,n=Tt?Tt(r):new t.constructor(r);return t.copy(n),n}(t,i);if(s==er||s==Ye||v&&!o){if(c=a||v?{}:function(t){return"function"!=typeof t.constructor||Pt(t)?{}:Ve(Jt(t))}(t),!i)return a?function(t,e){return Z(t,Qt(t),e)}(t,function(t,e){return t&&Z(e,Nt(e),t)}(c,t)):function(t,e){return Z(t,Wt(t),e)}(t,function(t,e){return t&&Z(e,It(e),t)}(c,t))}else{if(!rr[s])return o?t:{};c=Te(t,s,i)}}u||(u=new W);var b=u.get(t);if(b)return b;u.set(t,c),Je(t)?t.forEach((function(n){c.add(nr(n,e,r,n,t,u))})):We(t)&&t.forEach((function(n,o){c.set(o,nr(n,e,r,o,t,u))}));var p=f?void 0:(l?a?Zt:Yt:a?Nt:It)(t);return H(p||t,(function(n,o){p&&(n=t[o=n]),Y(c,o,nr(n,e,r,o,t,u))})),c}rr[Ye]=rr["[object Array]"]=rr["[object ArrayBuffer]"]=rr["[object DataView]"]=rr["[object Boolean]"]=rr["[object Date]"]=rr["[object Float32Array]"]=rr["[object Float64Array]"]=rr["[object Int8Array]"]=rr["[object Int16Array]"]=rr["[object Int32Array]"]=rr["[object Map]"]=rr["[object Number]"]=rr[er]=rr["[object RegExp]"]=rr["[object Set]"]=rr["[object String]"]=rr["[object Symbol]"]=rr["[object Uint8Array]"]=rr["[object Uint8ClampedArray]"]=rr["[object Uint16Array]"]=rr["[object Uint32Array]"]=!0,rr["[object Error]"]=rr[Ze]=rr["[object WeakMap]"]=!1;var or=1,ur=4;function cr(t){return nr(t,or|ur)}var ir="[object Symbol]";function ar(t){return"symbol"==typeof t||tt(t)&&g(t)==ir}var lr=/\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,fr=/^\w*$/;function sr(t,e){if(it(t))return!1;var r=typeof t;return!("number"!=r&&"symbol"!=r&&"boolean"!=r&&null!=t&&!ar(t))||(fr.test(t)||!lr.test(t)||null!=e&&t in Object(e))}var vr="Expected a function";function br(t,e){if("function"!=typeof t||null!=e&&"function"!=typeof e)throw new TypeError(vr);var r=function(){var n=arguments,o=e?e.apply(this,n):n[0],u=r.cache;if(u.has(o))return u.get(o);var c=t.apply(this,n);return r.cache=u.set(o,c)||u,c};return r.cache=new(br.Cache||q),r}br.Cache=q;var pr,dr,yr,hr=/[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g,jr=/\\(\\)?/g,gr=(pr=function(t){var e=[];return 46===t.charCodeAt(0)&&e.push(""),t.replace(hr,(function(t,r,n,o){e.push(n?o.replace(jr,"$1"):r||t)})),e},dr=br(pr,(function(t){return 500===yr.size&&yr.clear(),t})),yr=dr.cache,dr),_r=gr;function wr(t,e){for(var r=-1,n=null==t?0:t.length,o=Array(n);++r<n;)o[r]=e(t[r],r,t);return o}var mr=1/0,Or=f?f.prototype:void 0,Ar=Or?Or.toString:void 0;function Sr(t){if("string"==typeof t)return t;if(it(t))return wr(t,Sr)+"";if(ar(t))return Ar?Ar.call(t):"";var e=t+"";return"0"==e&&1/t==-mr?"-0":e}function kr(t){return null==t?"":Sr(t)}function xr(t,e){return it(t)?t:sr(t,e)?[t]:_r(kr(t))}var Pr=1/0;function zr(t){if("string"==typeof t||ar(t))return t;var e=t+"";return"0"==e&&1/t==-Pr?"-0":e}function Br(t,e){for(var r=0,n=(e=xr(e,t)).length;null!=t&&r<n;)t=t[zr(e[r++])];return r&&r==n?t:void 0}function Fr(t,e,r){var n=null==t?void 0:Br(t,e);return void 0===n?r:n}function Mr(t){var e=-1,r=null==t?0:t.length;for(this.__data__=new q;++e<r;)this.add(t[e])}function Er(t,e){for(var r=-1,n=null==t?0:t.length;++r<n;)if(e(t[r],r,t))return!0;return!1}function Ir(t,e){return t.has(e)}Mr.prototype.add=Mr.prototype.push=function(t){return this.__data__.set(t,"__lodash_hash_undefined__"),this},Mr.prototype.has=function(t){return this.__data__.has(t)};var Ur=1,Dr=2;function Nr(t,e,r,n,o,u){var c=r&Ur,i=t.length,a=e.length;if(i!=a&&!(c&&a>i))return!1;var l=u.get(t),f=u.get(e);if(l&&f)return l==e&&f==t;var s=-1,v=!0,b=r&Dr?new Mr:void 0;for(u.set(t,e),u.set(e,t);++s<i;){var p=t[s],d=e[s];if(n)var y=c?n(d,p,s,e,t,u):n(p,d,s,t,e,u);if(void 0!==y){if(y)continue;v=!1;break}if(b){if(!Er(e,(function(t,e){if(!Ir(b,e)&&(p===t||o(p,t,r,n,u)))return b.push(e)}))){v=!1;break}}else if(p!==d&&!o(p,d,r,n,u)){v=!1;break}}return u.delete(t),u.delete(e),v}function $r(t){var e=-1,r=Array(t.size);return t.forEach((function(t,n){r[++e]=[n,t]})),r}function Cr(t){var e=-1,r=Array(t.size);return t.forEach((function(t){r[++e]=t})),r}var Gr=1,Tr=2,Rr="[object Boolean]",Lr="[object Date]",Vr="[object Error]",qr="[object Map]",Wr="[object Number]",Hr="[object RegExp]",Jr="[object Set]",Kr="[object String]",Qr="[object Symbol]",Xr="[object ArrayBuffer]",Yr="[object DataView]",Zr=f?f.prototype:void 0,tn=Zr?Zr.valueOf:void 0;var en=1,rn=Object.prototype.hasOwnProperty;var nn=1,on="[object Arguments]",un="[object Array]",cn="[object Object]",an=Object.prototype.hasOwnProperty;function ln(t,e,r,o,u,c){var i=it(t),a=it(e),l=i?un:de(t),f=a?un:de(e),s=(l=l==on?cn:l)==cn,v=(f=f==on?cn:f)==cn,b=l==f;if(b&&st(t)){if(!st(e))return!1;i=!0,s=!1}if(b&&!s)return c||(c=new W),i||At(t)?Nr(t,e,r,o,u,c):function(t,e,r,o,u,c,i){switch(r){case Yr:if(t.byteLength!=e.byteLength||t.byteOffset!=e.byteOffset)return!1;t=t.buffer,e=e.buffer;case Xr:return!(t.byteLength!=e.byteLength||!c(new he(t),new he(e)));case Rr:case Lr:case Wr:return n(+t,+e);case Vr:return t.name==e.name&&t.message==e.message;case Hr:case Kr:return t==e+"";case qr:var a=$r;case Jr:var l=o&Gr;if(a||(a=Cr),t.size!=e.size&&!l)return!1;var f=i.get(t);if(f)return f==e;o|=Tr,i.set(t,e);var s=Nr(a(t),a(e),o,u,c,i);return i.delete(t),s;case Qr:if(tn)return tn.call(t)==tn.call(e)}return!1}(t,e,l,r,o,u,c);if(!(r&nn)){var p=s&&an.call(t,"__wrapped__"),d=v&&an.call(e,"__wrapped__");if(p||d){var y=p?t.value():t,h=d?e.value():e;return c||(c=new W),u(y,h,r,o,c)}}return!!b&&(c||(c=new W),function(t,e,r,n,o,u){var c=r&en,i=Yt(t),a=i.length;if(a!=Yt(e).length&&!c)return!1;for(var l=a;l--;){var f=i[l];if(!(c?f in e:rn.call(e,f)))return!1}var s=u.get(t),v=u.get(e);if(s&&v)return s==e&&v==t;var b=!0;u.set(t,e),u.set(e,t);for(var p=c;++l<a;){var d=t[f=i[l]],y=e[f];if(n)var h=c?n(y,d,f,e,t,u):n(d,y,f,t,e,u);if(!(void 0===h?d===y||o(d,y,r,n,u):h)){b=!1;break}p||(p="constructor"==f)}if(b&&!p){var j=t.constructor,g=e.constructor;j==g||!("constructor"in t)||!("constructor"in e)||"function"==typeof j&&j instanceof j&&"function"==typeof g&&g instanceof g||(b=!1)}return u.delete(t),u.delete(e),b}(t,e,r,o,u,c))}function fn(t,e,r,n,o){return t===e||(null==t||null==e||!tt(t)&&!tt(e)?t!=t&&e!=e:ln(t,e,r,n,fn,o))}var sn=1,vn=2;function bn(t){return t==t&&!_(t)}function pn(t,e){return function(r){return null!=r&&(r[t]===e&&(void 0!==e||t in Object(r)))}}function dn(t){var e=function(t){for(var e=It(t),r=e.length;r--;){var n=e[r],o=t[n];e[r]=[n,o,bn(o)]}return e}(t);return 1==e.length&&e[0][2]?pn(e[0][0],e[0][1]):function(r){return r===t||function(t,e,r,n){var o=r.length,u=o,c=!n;if(null==t)return!u;for(t=Object(t);o--;){var i=r[o];if(c&&i[2]?i[1]!==t[i[0]]:!(i[0]in t))return!1}for(;++o<u;){var a=(i=r[o])[0],l=t[a],f=i[1];if(c&&i[2]){if(void 0===l&&!(a in t))return!1}else{var s=new W;if(n)var v=n(l,f,a,t,e,s);if(!(void 0===v?fn(f,l,sn|vn,n,s):v))return!1}}return!0}(r,t,e)}}function yn(t,e){return null!=t&&e in Object(t)}function hn(t,e){return null!=t&&function(t,e,r){for(var n=-1,o=(e=xr(e,t)).length,u=!1;++n<o;){var c=zr(e[n]);if(!(u=null!=t&&r(t,c)))break;t=t[c]}return u||++n!=o?u:!!(o=null==t?0:t.length)&&yt(o)&&pt(c,o)&&(it(t)||ct(t))}(t,e,yn)}var jn=1,gn=2;function _n(t){return t}function wn(t){return function(e){return null==e?void 0:e[t]}}function mn(t){return sr(t)?wn(zr(t)):function(t){return function(e){return Br(e,t)}}(t)}function On(t){return"function"==typeof t?t:null==t?_n:"object"==typeof t?it(t)?(e=t[0],r=t[1],sr(e)&&bn(r)?pn(zr(e),r):function(t){var n=Fr(t,e);return void 0===n&&n===r?hn(t,e):fn(r,n,jn|gn)}):dn(t):mn(t);var e,r}var An,Sn=function(t,e,r){for(var n=-1,o=Object(t),u=r(t),c=u.length;c--;){var i=u[An?c:++n];if(!1===e(o[i],i,o))break}return t};var kn=function(t,e){return function(r,n){if(null==r)return r;if(!Et(r))return t(r,n);for(var o=r.length,u=e?o:-1,c=Object(r);(e?u--:++u<o)&&!1!==n(c[u],u,c););return r}}((function(t,e){return t&&Sn(t,e,It)})),xn=kn;function Pn(t,e){var r=-1,n=Et(t)?Array(t.length):[];return xn(t,(function(t,o,u){n[++r]=e(t,o,u)})),n}function zn(t,e){return(it(t)?wr:Pn)(t,On(e))}function Bn(t,e,r){var n=-1,o=t.length;e<0&&(e=-e>o?0:o+e),(r=r>o?o:r)<0&&(r+=o),o=e>r?0:r-e>>>0,e>>>=0;for(var u=Array(o);++n<o;)u[n]=t[n+e];return u}function Fn(t,e){return null==(t=function(t,e){return e.length<2?t:Br(t,Bn(e,0,-1))}(t,e=xr(e,t)))||delete t[zr((r=e,n=null==r?0:r.length,n?r[n-1]:void 0))];var r,n}var Mn="[object Object]",En=Function.prototype,In=Object.prototype,Un=En.toString,Dn=In.hasOwnProperty,Nn=Un.call(Object);function $n(t){return function(t){if(!tt(t)||g(t)!=Mn)return!1;var e=Jt(t);if(null===e)return!0;var r=Dn.call(e,"constructor")&&e.constructor;return"function"==typeof r&&r instanceof r&&Un.call(r)==Nn}(t)?void 0:t}var Cn=f?f.isConcatSpreadable:void 0;function Gn(t){return it(t)||ct(t)||!!(Cn&&t&&t[Cn])}function Tn(t,e,r,n,o){var u=-1,c=t.length;for(r||(r=Gn),o||(o=[]);++u<c;){var i=t[u];e>0&&r(i)?e>1?Tn(i,e-1,r,n,o):Ht(o,i):n||(o[o.length]=i)}return o}function Rn(t){return(null==t?0:t.length)?Tn(t,1):[]}var Ln=Math.max;var Vn=K?function(t,e){return K(t,"toString",{configurable:!0,enumerable:!1,value:(r=e,function(){return r}),writable:!0});var r}:_n,qn=Vn,Wn=Date.now;var Hn=function(t){var e=0,r=0;return function(){var n=Wn(),o=16-(n-r);if(r=n,o>0){if(++e>=800)return arguments[0]}else e=0;return t.apply(void 0,arguments)}}(qn),Jn=Hn;var Kn=function(t){return Jn(function(t,e,r){return e=Ln(void 0===e?t.length-1:e,0),function(){for(var n=arguments,o=-1,u=Ln(n.length-e,0),c=Array(u);++o<u;)c[o]=n[e+o];o=-1;for(var i=Array(e+1);++o<e;)i[o]=n[o];return i[e]=r(c),function(t,e,r){switch(r.length){case 0:return t.call(e);case 1:return t.call(e,r[0]);case 2:return t.call(e,r[0],r[1]);case 3:return t.call(e,r[0],r[1],r[2])}return t.apply(e,r)}(t,this,i)}}(t,void 0,Rn),t+"")}((function(t,e){var r={};if(null==t)return r;var n=!1;e=wr(e,(function(e){return e=xr(e,t),n||(n=e.length>1),e})),Z(t,Zt(t),r),n&&(r=nr(r,7,$n));for(var o=e.length;o--;)Fn(r,e[o]);return r})),Qn=Kn,Xn="[object String]";var Yn=wn("length"),Zn=RegExp("[\\u200d\\ud800-\\udfff\\u0300-\\u036f\\ufe20-\\ufe2f\\u20d0-\\u20ff\\ufe0e\\ufe0f]");var to="\\ud800-\\udfff",eo="["+to+"]",ro="[\\u0300-\\u036f\\ufe20-\\ufe2f\\u20d0-\\u20ff]",no="\\ud83c[\\udffb-\\udfff]",oo="[^"+to+"]",uo="(?:\\ud83c[\\udde6-\\uddff]){2}",co="[\\ud800-\\udbff][\\udc00-\\udfff]",io="(?:"+ro+"|"+no+")"+"?",ao="[\\ufe0e\\ufe0f]?",lo=ao+io+("(?:\\u200d(?:"+[oo,uo,co].join("|")+")"+ao+io+")*"),fo="(?:"+[oo+ro+"?",ro,uo,co,eo].join("|")+")",so=RegExp(no+"(?="+no+")|"+fo+lo,"g");function vo(t){return function(t){return Zn.test(t)}(t)?function(t){for(var e=so.lastIndex=0;so.test(t);)++e;return e}(t):Yn(t)}var bo="[object Map]",po="[object Set]";function yo(t){if(null==t)return 0;if(Et(t))return"string"==typeof(e=t)||!it(e)&&tt(e)&&g(e)==Xn?vo(t):t.length;var e,r=de(t);return r==bo||r==po?t.size:Mt(t).length}function ho(){let t,e,r=new Promise((function(){t=arguments[0],e=arguments[1]}));return r.resolve=t,r.reject=e,r}var jo=/\s/;var go=/^\s+/;function _o(t){return t?t.slice(0,function(t){for(var e=t.length;e--&&jo.test(t.charAt(e)););return e}(t)+1).replace(go,""):t}var wo=NaN,mo=/^[-+]0x[0-9a-f]+$/i,Oo=/^0b[01]+$/i,Ao=/^0o[0-7]+$/i,So=parseInt;function ko(t){if("number"==typeof t)return t;if(ar(t))return wo;if(_(t)){var e="function"==typeof t.valueOf?t.valueOf():t;t=_(e)?e+"":e}if("string"!=typeof t)return 0===t?t:+t;t=_o(t);var r=Oo.test(t);return r||Ao.test(t)?So(t.slice(2),r?2:8):mo.test(t)?wo:+t}var xo=1/0,Po=17976931348623157e292;function zo(t){return t?(t=ko(t))===xo||t===-xo?(t<0?-1:1)*Po:t==t?t:0:0===t?t:0}function Bo(t){var e=zo(t),r=e%1;return e==e?r?e-r:e:0}function Fo(t){return!(!function(t){return"[object String]"===Object.prototype.toString.call(t)}(t)||""===t)}function Mo(t){let e=!1;if(Fo(t))e=!isNaN(Number(t));else if(function(t){return"[object Number]"===Object.prototype.toString.call(t)}(t)){if(function(t){return t!=t}(t))return!1;e=!0}return e}function Eo(t){if(!Mo(t))return 0;return zo(t)}function Io(t){return!!Mo(t)&&(t=Eo(t),"number"==typeof(e=t)&&e==Bo(e));var e}var Uo=l.isFinite,Do=Math.min;var No=function(t){var e=Math[t];return function(t,r){if(t=ko(t),(r=null==r?0:Do(Bo(r),292))&&Uo(t)){var n=(kr(t)+"e").split("e");return+((n=(kr(e(n[0]+"e"+(+n[1]+r)))+"e").split("e"))[0]+"e"+(+n[1]-r))}return e(t)}}("round"),$o=No;function Co(t){if(!Mo(t))return 0;t=Eo(t);let e=$o(t);return"0"===String(e)?0:e}let Go="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split(""),To=Go.length;function Ro(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:32,e=[];var r;t=Io(r=t)&&Co(r)>0?Co(t):32;for(let r=0;r<t;r++)e[r]=Go[0|Math.random()*To];return e.join("")}function Lo(t){return"[object Array]"===Object.prototype.toString.call(t)}function Vo(t){return"[object Object]"===Object.prototype.toString.call(t)}function qo(t,e){var r;return(it(t)?H:xn)(t,"function"==typeof(r=e)?r:_n)}function Wo(t){let e=Object.prototype.toString.call(t);return"[object Function]"===e||"[object AsyncFunction]"===e}function Ho(t,e){let r=ho();if(!Lo(t)&&!Vo(t))return r.reject("rs is not an array or object"),r;let n=!1;if(Vo(t)){n=!0;let e=[];qo(t,((t,r)=>{e.push({k:r,v:t})})),t=e}Wo(e)||(e=function(t){return t});let o=-1,u=[];return t.reduce((function(t,r){return t.then((function(t){u.push(t),o+=1;let c=o,i=r;return n&&(c=r.k,i=r.v),Wo(e)?e(i,c):i}))}),Promise.resolve()).then((function(t){var e,n,o,c;u.push(t),c=null==(e=u)?0:e.length,u=c?Bn(e,(n=o||void 0===n?1:Bo(n))<0?0:n,c):[],r.resolve(u)})).catch((function(t){r.reject(t)})),r}return function(){let n=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};n.url||(n.url="mongodb://127.0.0.1:27017"),n.db||(n.db="worm"),n.cl||(n.cl="test");let o=new t.EventEmitter,u=e.MongoClient;async function c(t){let e=!1;t=cr(t);let r=new u(n.url),c=null;try{let u=r.db(n.db).collection(n.cl);Lo(t)||(t=[t]),t=zn(t,(function(t){return t.id||(t.id=Ro()),t})),c=await u.insertMany(t),c.insertedCount>0?(c={n:yo(t),nInserted:c.insertedCount,ok:c.acknowledged?1:0},o.emit("change","insert",t,c)):(e=!0,c="no insert data")}catch(t){e=!0,c=t}finally{await r.close()}return e?Promise.reject(c):c}async function i(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{},e=arguments.length>1?arguments[1]:void 0,r=!1,n=null;try{let r=e.find(t);n=await r.toArray()}catch(t){r=!0,n=t}return r?Promise.reject(n):n}return o.select=async function(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{},e=!1,r=new u(n.url),o=null;try{let e=r.db(n.db).collection(n.cl).find(t);o=await e.toArray(),o=zn(o,(function(t){return t=Qn(t,"_id")}))}catch(t){e=!0,o=t}finally{await r.close()}return e?Promise.reject(o):o},o.insert=c,o.save=async function(t){let e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},r=!1;t=cr(t);let i=Fr(e,"autoInsert",!0),a=new u(n.url),l=null;try{let e=a.db(n.db).collection(n.cl);Lo(t)||(t=[t]),l=await Ho(t,(async t=>{let r=null;return r=await e.findOneAndUpdate({id:t.id},{$set:t}),r=function(t){if(Vo(t)){for(let e in t)return!0;return!1}return!1}(r)?{n:1,nModified:1,ok:1}:{n:0,nModified:0,ok:1},i&&0===r.n&&(r=await c(t)),r})),o.emit("change","save",t,l)}catch(t){r=!0,l=t}finally{await a.close()}return r?Promise.reject(l):l},o.del=async function(t){let e=!1;t=cr(t);let r=new u(n.url),c=null;try{let e=r.db(n.db).collection(n.cl);Lo(t)||(t=[t]),c=await Ho(t,(async t=>{let r=null;return r=await e.deleteOne({id:t.id}),r={n:r.deletedCount,nDeleted:r.deletedCount,ok:r.acknowledged?1:0},r})),o.emit("change","del",t,c)}catch(t){e=!0,c=t}finally{await r.close()}return e?Promise.reject(c):c},o.delAll=async function(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{},e=!1,r=new u(n.url),c=null;try{let e=r.db(n.db).collection(n.cl);c=await e.deleteMany(t),c={n:c.deletedCount,nDeleted:c.deletedCount,ok:c.acknowledged?1:0},o.emit("change","delAll",null,c)}catch(t){e=!0,c=t}finally{await r.close()}return e?Promise.reject(c):c},o.selectGfs=async function(t){let r=!1,o=new u(n.url),c=null;try{c=await(async t=>{let r=ho(),u=o.db(n.db),c=new e.GridFSBucket(u,{chunkSizeBytes:10485760,bucketName:n.cl}),i=Buffer.from(""),a=c.openDownloadStreamByName(t);return a.on("data",(function(t){i=Buffer.concat([i,t])})),a.on("error",(function(t){r.reject(t)})),a.on("end",(function(){let t=new Uint8Array(i);i=null,r.resolve(t)})),r})(t)}catch(t){r=!0,c=t}finally{await o.close()}return r?Promise.reject(c):c},o.insertGfs=async function(t){let c=!1,i=Ro(),a=Buffer.from(t),l=new u(n.url),f=null;try{f=await(async(t,o)=>{let u=ho(),c=l.db(n.db),i=new e.GridFSBucket(c,{chunkSizeBytes:10485760,bucketName:n.cl}),a=new r.Readable;return a._read=()=>{},a.push(o),a.push(null),a.pipe(i.openUploadStream(t)).on("error",(function(t){u.reject(t)})).on("finish",(function(){let e={n:1,ok:1,id:t};u.resolve(e)})),u})(i,a),o.emit("change","insertGfs",null,f)}catch(t){c=!0,f=t}finally{await l.close()}return c?Promise.reject(f):f},o.delGfs=async function(t){let r=!1,c=new u(n.url),a=null;try{let r=c.db(n.db),u=new e.GridFSBucket(r,{chunkSizeBytes:10485760,bucketName:n.cl});if(a=await i({filename:t},u),0===a.length)a=`can not find id[${t}]`;else if(a.length>1)a=`duplicate id[${t}]`;else{let t=a[0]._id;a=await u.delete(t),a={n:1,nDeleted:1,ok:1},o.emit("change","delGfs",null,a)}}catch(t){r=!0,a=t}finally{await c.close()}return r?Promise.reject(a):a},o.delAllGfs=async function(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{},r=!1,c=new u(n.url),a=null;try{let r=c.db(n.db),u=new e.GridFSBucket(r,{chunkSizeBytes:10485760,bucketName:n.cl});a=await i(t,u);let l=yo(a),f=zn(a,(function(t){return async function(t,e){let r=!1,n=null;try{n=await e.delete(t),n={n:1,nDeleted:1,ok:1}}catch(t){r=!0,n=t}return r?Promise.reject(n):n}(t._id,u)}));a=await Promise.all(f),a={n:l,ok:1},o.emit("change","delAllGfs",null,a)}catch(t){r=!0,a=t}finally{await c.close()}return r?Promise.reject(a):a},o}}));
//# sourceMappingURL=w-orm-mongodb.umd.js.map
