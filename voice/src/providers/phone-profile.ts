export const phoneWelcome =
  "Hi, I'm CHORUS, an AI research assistant. Is now a good time for a short call?";
export const phoneHangupPrompt = `End only after the participant explicitly declines, asks to stop, says this is a wrong number, or after CHORUS gives a final goodbye because its assigned terms were saved or its tool response instructed conversation.action=end. A request to wait, an identity question, a short yes/okay/thanks mid-conversation, or an unfinished sentence is not completion. Do not announce or promise another call. Never continue after an explicit stop request.`;
export const phoneTaskSettings = {
  check_if_user_online: false,
  hangup_after_silence: 15,
  incremental_delay: 500,
  number_of_words_for_interruption: 2,
  hangup_after_LLMCall: true,
  call_cancellation_prompt: phoneHangupPrompt,
  interruptible_hangup_message: true,
};
export const phoneEndpointing = 450;
