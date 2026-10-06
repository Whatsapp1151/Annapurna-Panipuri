import {supabase,configured} from './supabase';

const LIVE_URL='https://annapurna-panipuri.onrender.com/';

if(configured&&supabase?.auth){
  const originalSignUp=supabase.auth.signUp.bind(supabase.auth);
  const originalReset=supabase.auth.resetPasswordForEmail.bind(supabase.auth);

  supabase.auth.signUp=(credentials={})=>{
    const options=credentials?.options||{};
    return originalSignUp({
      ...credentials,
      options:{...options,emailRedirectTo:LIVE_URL}
    });
  };

  supabase.auth.resetPasswordForEmail=(email,options={})=>
    originalReset(email,{...options,redirectTo:LIVE_URL});
}

window.AnnapurnaAuthRedirectURL=LIVE_URL;
