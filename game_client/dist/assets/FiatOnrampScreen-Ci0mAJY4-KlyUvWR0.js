import{d4 as ee,d9 as r,f5 as te,d6 as e,ds as l}from"./index-BlCetnqZ.js";import{p as oe,u as re,k as se,f as ne,h as ae}from"./SelectSourceAsset-ac3FApgI-pVzM97gV.js";import{n as P}from"./ScreenLayout-CyK-vOMq-iE4czAUQ.js";import{T as ie}from"./triangle-alert-DbgQi9aZ.js";import{c as T}from"./createLucideIcon-DCJmG57o.js";import{C as le}from"./circle-x-B8S8yXwo.js";import{C as ce}from"./check-DR-pvZGg.js";import{W as de}from"./wallet-B6UV4s8O.js";import{S as D}from"./smartphone-DFty7_60.js";import"./ModalHeader-DpkEBdQv-BiXA2Otu.js";import"./Screen-B0u1eY7p-BEsixf5z.js";import"./index-Dq_xe9dz-BFE1XKR4.js";const ue=[["path",{d:"M12 10h.01",key:"1nrarc"}],["path",{d:"M12 14h.01",key:"1etili"}],["path",{d:"M12 6h.01",key:"1vi96p"}],["path",{d:"M16 10h.01",key:"1m94wz"}],["path",{d:"M16 14h.01",key:"1gbofw"}],["path",{d:"M16 6h.01",key:"1x0f13"}],["path",{d:"M8 10h.01",key:"19clt8"}],["path",{d:"M8 14h.01",key:"6423bh"}],["path",{d:"M8 6h.01",key:"1dz90k"}],["path",{d:"M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3",key:"cabbwy"}],["rect",{x:"4",y:"2",width:"16",height:"20",rx:"2",key:"1uxh74"}]],L=T("building",ue);const pe=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],me=T("chevron-right",pe);const he=[["rect",{width:"20",height:"14",x:"2",y:"5",rx:"2",key:"ynyp8z"}],["line",{x1:"2",x2:"22",y1:"10",y2:"10",key:"1b3vmo"}]],q=T("credit-card",he);const ye=[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]],ge=T("loader-circle",ye),fe=({onClose:t})=>e.jsx(P,{showClose:!0,onClose:t,icon:ge,iconVariant:"loading",title:"Waiting for confirmation",subtitle:"Your payment is being processed. This may take a few moments.",watermark:!0}),Ce=({onClose:t,onRetry:c})=>e.jsx(P,{showClose:!0,onClose:t,icon:le,iconVariant:"error",title:"Something went wrong",subtitle:"We couldn't complete your transaction. Please try again.",primaryCta:{label:"Try again",onClick:c},secondaryCta:{label:"Close",onClick:t},watermark:!0}),xe=({onClose:t})=>e.jsx(P,{showClose:!0,onClose:t,icon:ce,iconVariant:"success",title:"Transaction initiated",subtitle:"Your purchase is being processed. It may take a few minutes for the funds to arrive in your wallet.",primaryCta:{label:"Done",onClick:t},watermark:!0});let ve={CREDIT_DEBIT_CARD:"card",APPLE_PAY:"Apple Pay",GOOGLE_PAY:"Google Pay",BANK_TRANSFER:"bank deposit",ACH:"bank deposit",SEPA:"bank deposit",PIX:"PIX"},be={CREDIT_DEBIT_CARD:e.jsx(q,{size:14}),APPLE_PAY:e.jsx(D,{size:14}),GOOGLE_PAY:e.jsx(D,{size:14}),BANK_TRANSFER:e.jsx(L,{size:14}),ACH:e.jsx(L,{size:14}),SEPA:e.jsx(L,{size:14}),PIX:e.jsx(de,{size:14})};const we=({opts:t,onClose:c,onEditSourceAsset:u,onEditPaymentMethod:h,onContinue:s,onAmountChange:y,amount:b,selectedQuote:p,quotesWarning:g,quotesCount:o,isLoading:k})=>{return e.jsxs(P,{showClose:!0,onClose:c,headerTitle:`Buy ${t.destination.asset.toLocaleUpperCase()}`,primaryCta:{label:"Continue",onClick:s,loading:k||!p,disabled:!p},helpText:g?e.jsxs(ke,{children:[e.jsx(ie,{size:16,strokeWidth:2}),e.jsx(_e,{children:e.jsxs(e.Fragment,g==="amount_too_low"?{children:[e.jsx(B,{children:"Amount too low"}),e.jsx(F,{children:"Please choose a higher amount to continue."})]}:{children:[e.jsx(B,{children:"Currency not available"}),e.jsx(F,{children:"Please choose another currency to continue."})]})})]}):p&&o>1?e.jsxs(Ae,{onClick:h,children:[(n=p.payment_method,be[n]??e.jsx(q,{size:14})),e.jsxs("span",{children:["Pay with ",(f=p.payment_method,ve[f]??f.replace(/_/g," ").toLowerCase().replace(/^\w/,(x=>x.toUpperCase())))]}),e.jsx(me,{size:14})]}):null,watermark:!0,children:[e.jsx(ne,{currency:t.source.selectedAsset,value:b,onChange:y,inputMode:"decimal",autoFocus:!0}),e.jsx(ae,{selectedAsset:t.source.selectedAsset,onEditSourceAsset:u})]});var f,n};let ke=l.div`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  background-color: var(--privy-color-warn-bg, #fffbbb);
  border: 1px solid var(--privy-color-border-warning, #facd63);
  overflow: clip;
  width: 100%;

  svg {
    flex-shrink: 0;
    color: var(--privy-color-icon-warning, #facd63);
  }
`,_e=l.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  flex: 1;
  min-width: 0;
  font-size: 0.75rem;
  line-height: 1.125rem;
  color: var(--privy-color-foreground);
  font-feature-settings:
    'calt' 0,
    'kern' 0;
  text-align: left;
`,B=l.span`
  font-weight: 600;
`,F=l.span`
  font-weight: 400;
`,Ae=l.button`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: none;
  border: none;
  cursor: pointer;

  && {
    padding: 0;
    color: var(--privy-color-accent);
    font-size: 0.875rem;
    font-style: normal;
    font-weight: 500;
    line-height: 1.375rem;
  }
`,je={CREDIT_DEBIT_CARD:"Credit / debit card",APPLE_PAY:"Apple Pay",GOOGLE_PAY:"Google Pay",BANK_TRANSFER:"Bank transfer",ACH:"ACH",SEPA:"SEPA",PIX:"PIX"},Se=t=>je[t]??t.replace(/_/g," ").toLowerCase().replace(/^\w/,(c=>c.toUpperCase()));const Pe=({onClose:t,onSelectPaymentMethod:c,quotes:u,isLoading:h})=>e.jsx(P,{showClose:!0,onClose:t,title:"Select payment method",subtitle:"Choose how you'd like to pay",watermark:!0,children:e.jsx(Ee,{children:u.map(((s,y)=>e.jsx(Me,{onClick:()=>c(s),disabled:h,children:e.jsxs(Te,{children:[e.jsx(ze,{children:e.jsx(q,{size:20})}),e.jsxs(Re,{children:[e.jsx(Le,{children:Se(s.payment_method)}),s.sub_provider&&e.jsxs(qe,{children:["via ",s.sub_provider]})]}),s.source_amount!=null&&s.source_currency_code&&e.jsxs(Ie,{children:[s.source_amount," ",s.source_currency_code]})]})},`${s.provider}-${s.payment_method}-${y}`)))})});let Ee=l.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
`,Me=l.button`
  border-color: var(--privy-color-border-default);
  border-width: 1px;
  border-radius: var(--privy-border-radius-mdlg);
  border-style: solid;
  display: flex;

  && {
    padding: 0.75rem 1rem;
  }
`,Te=l.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
`,ze=l.div`
  color: var(--privy-color-foreground-3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`,Re=l.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
  flex: 1;
`,Le=l.span`
  color: var(--privy-color-foreground);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.25rem;
`,qe=l.span`
  color: var(--privy-color-foreground-3);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.125rem;
`,Ie=l.span`
  color: var(--privy-color-foreground-3);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.375rem;
  flex-shrink: 0;
`;const Ue=({onClose:t,onContinue:c,onAmountChange:u,onSelectSource:h,onEditSourceAsset:s,onEditPaymentMethod:y,onSelectPaymentMethod:b,onRetry:p,opts:g,state:o,amount:k,selectedQuote:f,quotesWarning:n,quotesCount:x,isLoading:m})=>o.status==="select-amount"?e.jsx(we,{onClose:t,onContinue:c,onAmountChange:u,onEditSourceAsset:s,onEditPaymentMethod:y,opts:g,amount:k,selectedQuote:f,quotesWarning:n,quotesCount:x,isLoading:m}):o.status==="select-source-asset"?e.jsx(se,{onSelectSource:h,opts:g,isLoading:m}):o.status==="select-payment-method"?e.jsx(Pe,{onClose:t,onSelectPaymentMethod:b,quotes:o.quotes,isLoading:m}):o.status==="provider-confirming"?e.jsx(fe,{onClose:t}):o.status==="provider-error"?e.jsx(Ce,{onClose:t,onRetry:p}):o.status==="provider-success"?e.jsx(xe,{onClose:t}):null,Ke={component:()=>{let t=ee().data;if(!t?.FiatOnrampScreen)throw Error("Missing data");let{onSuccess:c,onFailure:u,getQuotes:h,getProviderUrl:s,getStatus:y,opts:b,initialQuotes:p,initialSelectedQuote:g}=t.FiatOnrampScreen,[o,k]=r.useState(b),[f,n]=r.useState({status:"select-amount"}),[x,m]=r.useState(null),[N,_]=r.useState(!1),[O,z]=r.useState(null),[A,W]=r.useState(b.defaultAmount??"0"),[G,I]=r.useState(null),[Y,R]=r.useState(null),j=G??p,v=Y??g,S=r.useRef(null),E=r.useRef(null),M=r.useCallback((async(a,i)=>{_(!0);try{let C=(await h({source:{asset:i.source.selectedAsset.toUpperCase(),amount:a},destination:{asset:i.destination.asset.toUpperCase(),chain:i.destination.chain,address:i.destination.address},environment:i.environment})).quotes??[];I(C),R((w=>{let d=w??g;return(d?C.find(($=>$.provider===d.provider&&$.payment_method===d.payment_method)):void 0)??C[0]??null})),C.length===0?z(a&&a!=="0"?"currency_not_available":"amount_too_low"):z(null)}catch{I([]),R(null),z(null)}finally{_(!1)}}),[h]),U=r.useCallback(((a,i)=>{S.current&&clearTimeout(S.current),S.current=setTimeout((()=>{M(a,i)}),750)}),[M]),Q=r.useCallback((a=>{W(a),U(a,o)}),[o,U]),X=r.useCallback((async()=>{let a;if(!v)return;let i=te();if(!i)return n({status:"provider-error"}),void m(Error("Unable to open payment window"));_(!0),E.current=new AbortController;try{let d=await s({source:{asset:o.source.selectedAsset.toUpperCase(),amount:A||"0"},destination:{asset:o.destination.asset.toUpperCase(),chain:o.destination.chain,address:o.destination.address},environment:o.environment,provider:v.provider,sub_provider:v.sub_provider,payment_method:v.payment_method,redirect_url:window.location.origin});i.location.href=d.url,a=d.session_id}catch{return i.close(),n({status:"provider-error"}),_(!1),void m(Error("Unable to start payment session"))}let C=await oe(i,E.current.signal);if(C.status==="aborted"||(_(!1),C.status==="closed"))return;C.status,n({status:"provider-confirming"});let w=await re({operation:()=>y({session_id:a,provider:v.provider}),until:d=>d.status==="completed"||d.status==="failed"||d.status==="cancelled",delay:0,interval:2e3,attempts:60,signal:E.current.signal});if(w.status!=="aborted"){if(w.status==="max_attempts")return n({status:"provider-error"}),void m(Error("Timed out waiting for response"));w.result?.status==="completed"?n({status:"provider-success"}):(n({status:"provider-error"}),m(Error(`Transaction ${w.result?.status??"failed"}`)))}}),[v,o,A,s,y]),H=r.useCallback((a=>{let i={...o,source:{...o.source,selectedAsset:a}};k(i),n({status:"select-amount"}),M(A,i)}),[o,A,M]),K=r.useCallback((()=>{n({status:"select-source-asset"})}),[]),V=r.useCallback((()=>{j&&j.length>0&&n({status:"select-payment-method",quotes:j})}),[j]),J=r.useCallback((a=>{R(a),n({status:"select-amount"})}),[]),Z=r.useCallback((()=>{m(null),n({status:"select-amount"})}),[]);return e.jsx(Ue,{onClose:r.useCallback((async()=>{E.current?.abort(),S.current&&clearTimeout(S.current),x?u(x):f.status!=="provider-success"?u(Error("User exited flow")):await c()}),[x,c,u]),opts:o,state:f,isLoading:N,amount:A,selectedQuote:v,quotesWarning:O,quotesCount:j?.length??0,onAmountChange:Q,onContinue:X,onSelectSource:H,onEditSourceAsset:K,onEditPaymentMethod:V,onSelectPaymentMethod:J,onRetry:Z})}};export{Ke as FiatOnrampScreen,Ke as default};
