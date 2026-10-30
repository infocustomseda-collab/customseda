// Use an allowlist rather than destination_address: other users' login links
// must be rejected, never redirected into the owner's inbox.
export const CMS_EMAIL_RECIPIENT='87c21@live.it';
export function cmsEmailSettings(config,environment) {
 if(!['staging','production'].includes(environment))return null;
 const sender=config.env?.[environment]?.vars?.CMS_EMAIL_FROM;
 return sender ? {from:{email:sender,name:'Custom Seda CMS'}} : null;
}
export function cmsEmailBinding(sender,remote=false) {
 return {name:'EMAIL',allowed_destination_addresses:[CMS_EMAIL_RECIPIENT],
  allowed_sender_addresses:[sender],...(remote?{remote:true}:{})};
}
