const factHooks = [
  "Tiny truth",
  "Worth knowing",
  "Quick spark",
  "Quiet flex",
  "Real talk",
  "Surprising bit",
  "Green flag",
  "Small detail",
  "Smart move",
  "Body clue",
  "Relationship cheat code",
  "Underrated fact",
  "Fast insight",
  "Better intimacy note",
  "Health win",
  "Confidence boost",
  "Comfort tip",
  "Science note",
  "Easy reminder",
  "Good-to-know",
];

const factInsights = [
  "clear consent is easiest when people ask specific questions instead of guessing.",
  "desire often grows from feeling relaxed, respected, and unpressured.",
  "arousal is not consent; words and comfort still matter.",
  "good kissing is usually more about rhythm and attention than intensity.",
  "lubrication can make intimacy safer because it reduces friction and irritation.",
  "condoms work best when they are put on before genital contact begins.",
  "stress can lower libido because attention and hormones are pulled toward survival mode.",
  "sleep affects sex drive more than most people expect.",
  "many STIs have no obvious symptoms, so testing can be normal preventive care.",
  "talking about boundaries early usually makes intimacy feel less awkward later.",
  "checking in can sound simple and still feel attractive when it is confident.",
  "feeling desired and feeling safe often work together.",
  "aftercare is not only for kink; many people like a calm moment after intimacy.",
  "foreplay can start hours earlier with kindness, attention, and emotional safety.",
  "pain during sex is information, not something to push through.",
  "pelvic floor tension can affect comfort, arousal, and orgasm.",
  "breathing slower can help the nervous system move from guarded to present.",
  "people can have different desire styles, and neither style is automatically wrong.",
  "curiosity usually beats performance pressure in intimate conversations.",
  "a respectful no can build more trust than a reluctant yes.",
  "condoms should be stored away from heat, wallets, and sharp edges.",
  "water-based lubricant is compatible with most condoms and toys.",
  "oil-based products can weaken latex condoms.",
  "sexual confidence often comes from communication, not from knowing every move.",
  "the brain is a major sex organ because mood, memory, and safety shape arousal.",
  "many people need context and connection before desire shows up.",
  "routine can dull desire, but tiny novelty can wake attention back up.",
  "compliments land better when they are specific and not only about appearance.",
  "asking what feels good can be more attractive than pretending to know.",
  "sexual health includes pleasure, comfort, consent, and prevention.",
  "hydration and general health can affect energy, comfort, and stamina.",
  "a slower pace can make it easier to notice what feels good.",
  "good intimacy usually has feedback loops, not mind reading.",
  "clear boundaries reduce anxiety because everyone knows the rules of the moment.",
  "orgasm is not the only measure of a satisfying sexual experience.",
  "pressure to perform can make arousal harder; playfulness often helps.",
  "different bodies respond to different timing, pressure, and context.",
  "STI testing is about care, not suspicion.",
  "emotional repair after awkward moments can strengthen trust.",
  "a partner who listens to small feedback is easier to trust with bigger vulnerability.",
  "turn-ons can change with mood, stress, age, medication, and relationship context.",
  "asking about contraception before the moment can prevent a lot of stress.",
  "some medications can affect libido, arousal, or orgasm.",
  "alcohol can lower inhibition while also making consent and arousal less clear.",
  "confidence can be quiet; it often looks like patience and attention.",
  "good hygiene is less about perfection and more about comfort and respect.",
  "sexual compatibility is built through honest feedback, not discovered all at once.",
  "people often remember how safe they felt more than any specific technique.",
  "taking breaks can keep intimacy comfortable and connected.",
  "a simple check-in can turn uncertainty into trust.",
];

export const targetSexualHealthFactCount = 1000;

export function buildSexualHealthFacts() {
  const facts = new Set<string>();

  for (const hook of factHooks) {
    for (const insight of factInsights) {
      facts.add(`${hook}: ${insight}`);
    }
  }

  return Array.from(facts).slice(0, targetSexualHealthFactCount);
}
