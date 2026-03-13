import{d9 as s,dA as S,d7 as B,d5 as W,d4 as L,d6 as r,ds as c,dS as U}from"./index-BlCetnqZ.js";import{t as $}from"./WarningBanner-D5LqDt95-CmQ3v1Z7.js";import{j as R}from"./WalletInfoCard-hC5PhrNs-DSh_qzT_.js";import{n as z}from"./ScreenLayout-CyK-vOMq-iE4czAUQ.js";import"./ExclamationTriangleIcon-CTq3v17E.js";import"./ModalHeader-DpkEBdQv-BiXA2Otu.js";import"./ErrorMessage-D8VaAP5m-BjphxLZp.js";import"./LabelXs-oqZNqbm_-BWQ1ahRX.js";import"./Address-B99EaiMb-BdNPLLrI.js";import"./check-DR-pvZGg.js";import"./createLucideIcon-DCJmG57o.js";import"./copy-y_agXC9i.js";import"./shared-FM0rljBt-DkCcm1jF.js";import"./Screen-B0u1eY7p-BEsixf5z.js";import"./index-Dq_xe9dz-BFE1XKR4.js";const K=({address:e,accessToken:t,appConfigTheme:a,onClose:d,isLoading:l=!1,exportButtonProps:i,onBack:n})=>r.jsx(z,{title:"Export wallet",subtitle:r.jsxs(r.Fragment,{children:["Copy either your private key or seed phrase to export your wallet."," ",r.jsx("a",{href:"https://privy-io.notion.site/Transferring-your-account-9dab9e16c6034a7ab1ff7fa479b02828",target:"blank",rel:"noopener noreferrer",children:"Learn more"})]}),onClose:d,onBack:n,showBack:!!n,watermark:!0,children:r.jsxs(O,{children:[r.jsx($,{theme:a,children:"Never share your private key or seed phrase with anyone."}),r.jsx(R,{title:"Your wallet",address:e,showCopyButton:!0}),r.jsx("div",{style:{width:"100%"},children:l?r.jsx(D,{}):t&&i&&r.jsx(N,{accessToken:t,dimensions:{height:"44px"},...i})})]})});let O=c.div`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  text-align: left;
`,D=()=>r.jsx(F,{children:r.jsx(M,{children:"Loading..."})}),F=c.div`
  display: flex;
  gap: 12px;
  height: 44px;
`,M=c.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 16px;
  font-weight: 500;
  border-radius: var(--privy-border-radius-md);
  background-color: var(--privy-color-background-2);
  color: var(--privy-color-foreground-3);
`;function N(e){let[t,a]=s.useState(e.dimensions.width),[d,l]=s.useState(void 0),i=s.useRef(null);s.useEffect((()=>{if(i.current&&t===void 0){let{width:p}=i.current.getBoundingClientRect();a(p)}let o=getComputedStyle(document.documentElement);l({background:o.getPropertyValue("--privy-color-background"),background2:o.getPropertyValue("--privy-color-background-2"),foreground3:o.getPropertyValue("--privy-color-foreground-3"),foregroundAccent:o.getPropertyValue("--privy-color-foreground-accent"),accent:o.getPropertyValue("--privy-color-accent"),accentDark:o.getPropertyValue("--privy-color-accent-dark"),success:o.getPropertyValue("--privy-color-success"),colorScheme:o.getPropertyValue("color-scheme")})}),[]);let n=e.chainType==="ethereum"&&!e.imported&&!e.isUnifiedWallet;return r.jsx("div",{ref:i,children:t&&r.jsxs(q,{children:[r.jsx("iframe",{style:{position:"absolute",zIndex:1},width:t,height:e.dimensions.height,allow:"clipboard-write self *",src:U({origin:e.origin,path:`/apps/${e.appId}/embedded-wallets/export`,query:e.isUnifiedWallet?{v:"1-unified",wallet_id:e.walletId,client_id:e.appClientId,width:`${t}px`,caid:e.clientAnalyticsId,phrase_export:n,...d}:{v:"1",entropy_id:e.entropyId,entropy_id_verifier:e.entropyIdVerifier,hd_wallet_index:e.hdWalletIndex,chain_type:e.chainType,client_id:e.appClientId,width:`${t}px`,caid:e.clientAnalyticsId,phrase_export:n,...d},hash:{token:e.accessToken}})}),r.jsx(g,{children:"Loading..."}),n&&r.jsx(g,{children:"Loading..."})]})})}const le={component:()=>{let[e,t]=s.useState(null),{authenticated:a,user:d}=S(),{closePrivyModal:l,createAnalyticsEvent:i,clientAnalyticsId:n,client:o}=B(),p=W(),{data:m,onUserCloseViaDialogOrKeybindRef:x}=L(),{onFailure:v,onSuccess:w,origin:b,appId:k,appClientId:I,entropyId:j,entropyIdVerifier:C,walletId:_,hdWalletIndex:V,chainType:E,address:y,isUnifiedWallet:P,imported:T,showBackButton:A}=m.keyExport,f=h=>{l({shouldCallAuthOnSuccess:!1}),v(typeof h=="string"?Error(h):h)},u=()=>{l({shouldCallAuthOnSuccess:!1}),w(),i({eventName:"embedded_wallet_key_export_completed",payload:{walletAddress:y}})};return s.useEffect((()=>{if(!a)return f("User must be authenticated before exporting their wallet");o.getAccessToken().then(t).catch(f)}),[a,d]),x.current=u,r.jsx(K,{address:y,accessToken:e,appConfigTheme:p.appearance.palette.colorScheme,onClose:u,isLoading:!e,onBack:A?u:void 0,exportButtonProps:e?{origin:b,appId:k,appClientId:I,clientAnalyticsId:n,entropyId:j,entropyIdVerifier:C,walletId:_,hdWalletIndex:V,isUnifiedWallet:P,imported:T,chainType:E}:void 0})}};let q=c.div`
  overflow: visible;
  position: relative;
  overflow: none;
  height: 44px;
  display: flex;
  gap: 12px;
`,g=c.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 16px;
  font-weight: 500;
  border-radius: var(--privy-border-radius-md);
  background-color: var(--privy-color-background-2);
  color: var(--privy-color-foreground-3);
`;export{le as EmbeddedWalletKeyExportScreen,K as EmbeddedWalletKeyExportView,le as default};
