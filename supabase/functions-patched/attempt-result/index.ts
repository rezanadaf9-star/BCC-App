import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function getClients(req: Request, fallbackAccessToken = "") {
  const url = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("PROJECT_ANON_KEY")!;
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("PROJECT_SERVICE_ROLE_KEY")!;
  const header = req.headers.get("Authorization") || "";
  const auth = header || (fallbackAccessToken ? `Bearer ${fallbackAccessToken}` : "");
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const adminClient = createClient(url, secret);
  return { userClient, adminClient };
}

Deno.serve(async req => {
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  try{
    const {userClient,adminClient}=getClients(req);
    const {data:auth}=await userClient.auth.getUser();
    if(!auth.user)return json({error:"Unauthorized"},401);
    {const {data:sOk}=await userClient.rpc("bcc_session_not_revoked");if(sOk===false)return json({error:"This login session was replaced. Please sign in again."},401);}
    const {data:attempt,error}=await adminClient.from("quiz_attempts").select("*").eq("id",(await req.json()).attempt_id).single();
    if(error||!attempt)return json({error:"Attempt not found."},404);
    if(attempt.student_id!==auth.user.id){
      const {data:p}=await adminClient.from("profiles").select("role").eq("id",auth.user.id).single();
      if(!p||!["teacher","admin"].includes(p.role))return json({error:"Forbidden"},403);
    }
    const {data:answers}=await adminClient.from("quiz_answers").select("*").eq("attempt_id",attempt.id);
    const {data:questions}=await adminClient.from("quiz_questions").select("id,position,question_text,option_a,option_b,option_c,option_d,correct_option,explanation").eq("quiz_id",attempt.quiz_id).order("position");
    return json({ok:true,attempt,answers:answers||[],questions:questions||[]});
  }catch(e){return json({error:e instanceof Error?e.message:"Server error."},500)}
});