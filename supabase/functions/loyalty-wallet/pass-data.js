export const SITE='https://annapurna-panipuri.onrender.com';
const local=value=>({defaultValue:{language:'en-GB',value}});
export function barcode(profile){
  if(!profile?.qr_token||!profile?.customer_id)throw new Error('Missing loyalty profile');
  return 'annapurna:'+profile.qr_token;
}
export function googlePass(profile,issuer,classId){
  return {id:`${issuer}.customer_${profile.customer_id}`,classId,state:'ACTIVE',
    genericType:'GENERIC_TYPE_UNSPECIFIED',hexBackgroundColor:'#244d1c',
    logo:{sourceUri:{uri:SITE+'/Logo1.png'},contentDescription:local('Annapurna Panipuri logo')},
    cardTitle:local('Annapurna Panipuri'),header:local('My Loyalty QR'),
    barcode:{type:'QR_CODE',value:barcode(profile)},
    textModulesData:[{id:'instructions',header:'Scan at the counter',body:'Show this QR to staff when earning or redeeming rewards. Open the app for your current balance.'}],
    linksModuleData:{uris:[{uri:SITE,description:'Open Annapurna Panipuri',id:'website'}]}};
}
export function applePass(profile,passTypeIdentifier,teamIdentifier){
  return {formatVersion:1,serialNumber:'customer_'+profile.customer_id,passTypeIdentifier,teamIdentifier,
    organizationName:'Annapurna Panipuri',description:'Annapurna Panipuri loyalty QR',logoText:'Annapurna Panipuri',
    foregroundColor:'rgb(255,255,255)',backgroundColor:'rgb(36,77,28)',labelColor:'rgb(245,217,153)',
    generic:{primaryFields:[{key:'membership',label:'LOYALTY CARD',value:'My Loyalty QR'}],
      backFields:[{key:'instructions',label:'Scan at the counter',value:'Show this QR to staff when earning or redeeming rewards. Open the app for your current balance.'},{key:'website',label:'Website',value:SITE}]},
    barcodes:[{format:'PKBarcodeFormatQR',message:barcode(profile),messageEncoding:'iso-8859-1'}]};
}
