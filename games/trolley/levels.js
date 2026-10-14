// TROLLEY TROUBLE - level data. 28 original, silly, family-friendly dilemmas.
//
// Layout convention: the LEFT track is where the trolley is already heading ("stay" = do nothing),
// the RIGHT track is where it goes if you pull the lever ("pull").
//
//   items   : emoji drawn on the track end. A string, or { e, hat } for an emoji wearing a smaller emoji.
//   label   : short caption under the track
//   out     : the (cartoon, nobody-is-hurt) aftermath shown after the bonk
//   bonk    : word that pops on impact (default is picked from a list)
//   fx      : 'stars' (default) | 'confetti' | 'sparkle'
//   soft    : trolley passes through without a real bonk (ghosts, empty tracks); items just wiggle
//   badge   : small "x N" tag on the group
//   pullPct : SIMULATED % of players who pulled the lever (fixed per level, never real data)
//   util    : which side a strict "save the bigger good" thinker would pick ('stay' | 'pull'), if any
//   fake    : the lever is a decoy - pulling it still sends the trolley down the left track
//   loop    : the tracks loop around, so the trolley hits BOTH groups; you only pick the order
(function () {
  const rep = (e, n) => Array.from({ length: n }, () => e);

  window.TROLLEY_LEVELS = [
    {
      id: 'ducks', title: 'Rubber Duck Rumble', theme: 'day', pullPct: 82, util: 'pull',
      text: 'A runaway trolley is rolling toward FIVE rubber ducks. Pull the lever and it heads for ONE rubber duck wearing a tiny crown instead. Squeaks are guaranteed either way.',
      stay: { items: rep('🐥', 5), label: '5 rubber ducks', bonk: 'SQUEAK!',
        out: 'Five ducks go squeak-squeak-squeak-squeak-squeak. It sounds like a very small orchestra tuning up.' },
      pull: { items: [{ e: '🐥', hat: '👑' }], label: '1 rubber duck in a tiny crown', bonk: 'BONK!',
        out: 'The crown spins away like a frisbee. The duck is fine, just extremely dethroned.' }
    },
    {
      id: 'future', title: 'Future You', theme: 'sunset', pullPct: 29,
      text: 'Two strangers are arguing about pineapple on pizza, right in the trolley\'s path. Pull the lever and it heads for YOU at age 80, who time-traveled here on a hoverboard to give advice. Future you says it\'ll be fine.',
      stay: { items: ['🧑‍🦱', '🍕', '🧑‍🦰'], label: '2 strangers and 1 pineapple pizza',
        out: 'The strangers hop aside, still arguing. The pizza takes the hit. Pineapple was never going to win this one anyway.' },
      pull: { items: ['🧓'], label: 'Future you, age 80, on a hoverboard', fx: 'sparkle', bonk: 'ZAP!',
        out: 'Future you pops into sparkles and reappears a second later. "Worth it," they say. "Also, buy the red bike."' }
    },
    {
      id: 'sock', title: 'One Lonely Sock', theme: 'day', pullPct: 13, util: 'stay',
      text: 'The trolley is rolling toward a single sock that has been missing its partner for three years. Pull the lever to hit a perfectly matching pair of socks who are very happy together.',
      stay: { items: ['🧦'], label: '1 lonely sock', bonk: 'FLOMP!',
        out: 'The lonely sock goes flat. Somewhere in the dryer dimension, its partner feels a strange tingle.' },
      pull: { items: ['🧦', '🧦'], label: '2 matching socks, in love', bonk: 'FLOMP!',
        out: 'Both socks go flat together. "At least we match," whispers the left one.' }
    },
    {
      id: 'philosophers', title: 'Five Sleepy Philosophers', theme: 'night', pullPct: 76, util: 'pull',
      text: 'Five philosophers dozed off on the tracks, mid-argument about whether trolleys are even real. On the other track, one VERY awake philosopher is shouting "TROLLEYS ARE A SOCIAL CONSTRUCT!"',
      stay: { items: rep({ e: '😴', hat: '🎓' }, 5), label: '5 sleepy philosophers',
        out: 'They wake up, brush off the stars, and agree: the trolley was real all along. Debate settled. Naps resume.' },
      pull: { items: [{ e: '🤔', hat: '🎓' }], label: '1 wide-awake philosopher',
        out: '"Interesting," he says, seeing stars. "Very real stars." He is already updating his thesis.' }
    },
    {
      id: 'delivery', title: 'Overnight Delivery', theme: 'day', pullPct: 66, util: 'pull',
      text: 'A wobbly tower of twelve packages sits on the main track while the delivery driver pretends it\'s fine. On the other track sits ONE package: your 2 a.m. impulse purchase, a banana-shaped phone.',
      stay: { items: rep('📦', 6), label: 'A wobbly stack of 12 packages', badge: 'x12', fx: 'confetti', bonk: 'POP!',
        out: 'The boxes burst into bubble-wrap confetti. The driver is thrilled; they have wanted to pop that wrap all week.' },
      pull: { items: ['📦'], label: '1 package: your banana phone',
        out: 'Your banana phone goes flat. Your app buzzes: "Your package has been delivered. Enjoy!"' }
    },
    {
      id: 'cat', title: 'The Cat Knows', theme: 'night', pullPct: 34,
      text: 'On one track: your laptop, with 14 unsaved tabs of homework. On the other: a cat who knows your password, your search history, and where you hid the snacks.',
      stay: { items: ['💻'], label: 'Your laptop (14 unsaved tabs)',
        out: 'The laptop gives one sad *bing*. Your homework joins the great cloud in the sky. The cat looks smug.' },
      pull: { items: ['🐈'], label: 'A cat who knows your password',
        out: 'The cat does a backflip over the trolley and lands on your keyboard. Your password is now "mmmmmfish".' }
    },
    {
      id: 'monday', title: 'Monday vs Saturday', theme: 'sunset', pullPct: 6, util: 'stay',
      text: 'The trolley is heading straight for Monday, early-morning edition. Pull the lever and it flattens Saturday instead (fresh out of bed, no plans). Choose wisely, calendar-wise.',
      stay: { items: [{ e: '📅', hat: '😩' }], label: 'Monday, 7:00 a.m. edition',
        out: 'Monday goes flat. It peels itself off the track and slides under next week. It will be back. It is always back.' },
      pull: { items: ['🏖️'], label: 'Saturday, no plans',
        out: 'Saturday goes flat. The weekend is now one day long and everybody is furious. Your phone buzzes: "Happy Monday!"' }
    },
    {
      id: 'empty', title: 'Both Tracks Empty', theme: 'desert', pullPct: 57, soft: true,
      text: 'Good news: both tracks are completely empty. The trolley is just a little lost and a little nervous. Do you pull the lever anyway?',
      stay: { items: ['🌵'], label: 'Nothing. (A cactus, maybe.)', soft: true, fx: 'sparkle', bonk: 'WHOOSH!',
        out: 'The trolley rolls past the cactus without a scratch. The cactus does not wave back. Prickly.' },
      pull: { items: ['🍃'], label: 'Nothing. (A leaf, maybe.)', soft: true, fx: 'sparkle', bonk: 'WHOOSH!',
        out: 'The trolley glides past the leaf. You pulled a lever for no reason at all, and it felt incredible.' }
    },
    {
      id: 'tortoise', title: 'The Tortoise and the Hare', theme: 'day', pullPct: 41,
      text: 'The trolley is crawling along at about walking speed. A very patient tortoise on the main track says it has "plenty of time." On the other track, a hare is already late for something.',
      stay: { items: ['🐢'], label: '1 very patient tortoise', bonk: 'BOP!',
        out: 'The tortoise pulls into its shell. "Rushing is overrated," it mumbles, and refuses to come out until Thursday.' },
      pull: { items: ['🐇'], label: '1 hare, running late', bonk: 'BOINK!',
        out: 'The hare is back on his feet in 0.2 seconds. He is still late, and now also annoyed.' }
    },
    {
      id: 'ants', title: 'A Million Ants', theme: 'desert', pullPct: 52,
      text: 'A million tiny ants are having a picnic on the main track. Pull the lever and the trolley heads for one enormous, very polite elephant who really did not plan on being in this story.',
      stay: { items: rep('🐜', 3), label: '1,000,000 ants (they are tiny)', badge: 'x1,000,000', bonk: 'TINK!',
        out: 'A million ants launch into the sky like a very small firework. They regroup instantly and file a complaint with the ant union.' },
      pull: { items: ['🐘'], label: '1 polite elephant', bonk: 'DONK!',
        out: 'The elephant trumpets "ouch" in a surprisingly quiet voice and sees stars the size of dinner plates.' }
    },
    {
      id: 'pajamas', title: 'Pajama Hero', theme: 'night', pullPct: 71, util: 'pull',
      text: 'The trolley is heading toward five strangers stuck in one very long group hug. Or you can pull the lever and it hits YOU instead. Luckily, you are wearing extremely thick pajamas.',
      stay: { items: ['👩‍🦰', '🧔', '👧', '🧑‍🦳', '👦'], label: '5 strangers in a group hug',
        out: 'They wiggle free with a collective "HEY!" You will now be known as "the one who did nothing."' },
      pull: { items: ['🥱'], label: 'YOU, in extremely thick pajamas', bonk: 'FLUMP!',
        out: 'The pajamas absorb everything. You see stars in the shape of your own face. You are a hero. A fluffy hero.' }
    },
    {
      id: 'banana', title: 'The Banana Lever', theme: 'beach', pullPct: 63, fake: true,
      text: 'Someone swapped the lever for a banana. It is probably not connected to anything. Probably. The trolley is heading toward three very trusting elves.',
      stay: { items: rep('🧝', 3), label: '3 trusting elves',
        out: 'The elves see stars, then see you. "We trusted the banana too," they say.' },
      pull: { items: ['🍌'], label: 'Pull the banana (it is a banana)',
        out: 'You pull the banana. It peels. The trolley rolls on, completely unmoved, straight into the elves anyway. You are now holding a banana.' }
    },
    {
      id: 'loop', title: 'The Time Loop', theme: 'space', pullPct: 44, loop: true,
      text: 'Space is weird: both tracks loop back around. Whichever way you send it, the trolley hits the first group, zooms round, then hits the other one. The only thing you control is the ORDER.',
      stay: { items: rep('🚧', 5), label: '5 traffic cones (first)',
        out: 'Cones, then a loop, then one more cone. Everything got bonked. Your choice affected the order and absolutely nothing else.' },
      pull: { items: ['🚧'], label: '1 traffic cone (first)',
        out: 'One cone, then a loop, then five more. Same result, different vibes. Philosophers are still arguing about it.' }
    },
    {
      id: 'homework', title: 'The Homework Dog', theme: 'day', pullPct: 55,
      text: 'A spare copy of your homework (due tomorrow) lies on the main track. On the other track: the dog, who keeps swearing he ate the first copy. He is extremely fluffy and extremely unconvincing.',
      stay: { items: ['📚'], label: 'Your spare homework copy', fx: 'confetti', bonk: 'FWAP!',
        out: 'The homework goes flat. A teacher will never believe "a trolley ate it." (Try anyway.)' },
      pull: { items: ['🐕'], label: 'The dog (swears he ate it)', bonk: 'BOING!',
        out: 'The dog coughs up page 3. "Okay," he admits, "that one was me."' }
    },
    {
      id: 'spoiler', title: 'Spoiler Alert', theme: 'night', pullPct: 73,
      text: 'The season finale you have waited a whole year for is playing on a TV right on the main track. Pull the lever and the trolley goes for the guy who is about to say "You will NEVER guess who the villain is."',
      stay: { items: ['📺'], label: 'The season finale you waited a year for', bonk: 'ZZZT!',
        out: 'The TV flickers into static. The finale is gone. The spoiler guy shrugs: "It was the butler."' },
      pull: { items: ['🗣️'], label: 'The guy about to spoil it', bonk: 'HUSH!',
        out: 'The spoiler guy is stunned silent for a full minute. Best minute of your life. You watch the finale in peace.' }
    },
    {
      id: 'cookies', title: 'Fortune Cookies', theme: 'sunset', pullPct: 46,
      text: 'FIVE fortune cookies on the main track all say "DO NOTHING." One lone fortune cookie on the other track says "PULL THE LEVER." They are cookies. You are the one with the lever.',
      stay: { items: rep('🥠', 5), label: '5 cookies saying DO NOTHING', fx: 'confetti', bonk: 'CRUNCH!',
        out: 'Crumbs everywhere. Inside one: "You will regret taking advice from a snack."' },
      pull: { items: ['🥠'], label: '1 cookie saying PULL', fx: 'confetti', bonk: 'CRUNCH!',
        out: 'Crumbs. The little slip reads: "Well done. Or not. We are a cookie."' }
    },
    {
      id: 'mimes', title: 'Mime Time', theme: 'day', pullPct: 64, util: 'pull',
      text: 'Five mimes are stuck inside an invisible box on the main track and cannot call for help (professional pride). On the other track: one street performer holding an extremely loud megaphone.',
      stay: { items: rep('🤫', 5), label: '5 mimes in an invisible box',
        out: 'The mimes act out "ouch" in perfect silence. It is the most expressive thing you have ever seen.' },
      pull: { items: [{ e: '🧑‍🎤', hat: '📢' }], label: '1 street performer + megaphone', bonk: 'WEE-OOO!',
        out: 'The megaphone goes "WEEEE-OOOOO" and wakes up the entire park. Sorry, park.' }
    },
    {
      id: 'ghosts', title: 'Ghost Trolley', theme: 'spooky', pullPct: 38, soft: true, ghost: true,
      text: 'This is a ghost trolley. It passes right through everything, and the ghosts on the tracks absolutely love it. Five on the main track, one on the other. Nobody is in danger; everybody is just a little ticklish.',
      stay: { items: rep('👻', 5), label: '5 giggly ghosts', soft: true, fx: 'sparkle', bonk: 'WHEEE!',
        out: 'The trolley glides straight through. The ghosts giggle: "That tickles! Again! AGAIN!"' },
      pull: { items: ['👻'], label: '1 giggly ghost', soft: true, fx: 'sparkle', bonk: 'WHEEE!',
        out: 'The trolley glides through. The ghost whispers "boo-tiful," then bursts out laughing.' }
    },
    {
      id: 'slice', title: 'The Last Slice', theme: 'sunset', pullPct: 31,
      text: 'The last slice of pizza (the extra cheesy one) sits on the main track. Pull the lever and the trolley heads for the two friends who were just about to fight over it.',
      stay: { items: ['🍕'], label: 'The last slice (extra cheesy)', bonk: 'SPLAT!',
        out: 'The slice goes flat. The friends hug, mourn, and order another pizza. A wonderful ending.' },
      pull: { items: ['🧑', '👩'], label: '2 friends about to fight over it',
        out: 'They see stars and forget what they were arguing about. You eat the last slice. Nobody saw. (We saw.)' }
    },
    {
      id: 'wifi', title: 'Neighborhood Wi-Fi', theme: 'night', pullPct: 69,
      text: 'The trolley is heading for the neighborhood Wi-Fi router. Pull the lever and it hits your neighbor\'s smart toaster instead, which has been sending very strange emails.',
      stay: { items: ['📡'], label: 'The neighborhood Wi-Fi router', bonk: 'ZZZT!',
        out: 'The router goes dark. The whole street looks up from their phones, blinks, and discovers the sun. It is lovely.' },
      pull: { items: [{ e: '🍞', hat: '📧' }], label: 'A smart toaster (sends weird emails)', fx: 'confetti', bonk: 'POP!',
        out: 'The toaster launches two slices of toast into the sky. Both land butter-side up. Nobody knows what it means.' }
    },
    {
      id: 'penguins', title: 'Penguin Lawyer', theme: 'snow', pullPct: 77, util: 'pull',
      text: 'Five penguins are waiting on the tracks for a bus that never comes. One penguin on the other track is wearing a bow tie and insists it is a lawyer.',
      stay: { items: rep('🐧', 5), label: '5 penguins waiting for a bus', bonk: 'BOP!',
        out: 'The penguins slide away on their bellies shouting "WHEEE." Honestly, the best day they have had in weeks.' },
      pull: { items: [{ e: '🐧', hat: '🎀' }], label: '1 penguin in a bow tie (a lawyer)',
        out: 'The penguin straightens its tiny bow tie. "You will be hearing from my other lawyer," it says. "Also me."' }
    },
    {
      id: 'liar', title: 'The Liar Lever', theme: 'space', pullPct: 48,
      text: 'A sign on the lever says: "THIS LEVER ONLY WORKS IF YOU DON\'T PULL IT." There are three sandwiches on each track. Your move, logic.',
      stay: { items: rep('🥪', 3), label: '3 sandwiches',
        out: 'You did nothing, so the lever works, which means you pulled it, which means it does not. The trolley splits in two. Philosophy has left the chat.' },
      pull: { items: rep('🥪', 3), label: '3 other sandwiches (identical)',
        out: 'You pulled it, so it does not work, so the trolley goes straight, but you pulled it, so... The sandwiches survive on a technicality.' }
    },
    {
      id: 'pinata', title: 'Piñata Party', theme: 'candy', pullPct: 78, util: 'pull',
      text: 'Five kids are standing right in the trolley\'s path at a birthday party. Pull the lever and it hits the piñata on the other track instead, which absolutely explodes with candy.',
      stay: { items: ['👧', '👦', '🧒', '👧', '👦'], label: '5 kids at a birthday party',
        out: 'The kids sway, dizzy but giggling. "Do it again!" they shout. (Do not do it again.)' },
      pull: { items: ['🪅'], label: '1 candy-stuffed piñata', fx: 'confetti', bonk: 'KABOOM!',
        out: 'Candy rain! The kids declare the trolley "best party guest ever." You are now a legend.' }
    },
    {
      id: 'dino', title: 'Baby Dino', theme: 'desert', pullPct: 17,
      text: 'A baby dinosaur has decided the trolley is its mom and is running toward it shouting "MOM!" On the other track: three dinosaur eggs, wobbling nervously.',
      stay: { items: ['🦖'], label: '1 baby dino (thinks the trolley is mom)', bonk: 'BOINK!',
        out: '"MOM?" squeaks the baby dino, and hops on board. The trolley now has a passenger and a mild identity crisis.' },
      pull: { items: rep('🥚', 3), label: '3 dinosaur eggs', bonk: 'SPLAT!',
        out: 'Three eggs go sunny-side up. The baby dino cries "WHY?!" It is now an omelet situation.' }
    },
    {
      id: 'wizard', title: 'The Pumpkin Spell', theme: 'spooky', pullPct: 27,
      text: 'A wizard is halfway through a spell that turns whatever he points at into a pumpkin. Straight ahead: the wizard. Pull the lever: a fairy on her coffee break, who did not ask for any of this.',
      stay: { items: ['🧙'], label: 'A wizard, mid-spell', fx: 'sparkle', bonk: 'POOF!',
        out: 'The spell misfires! The trolley turns into a pumpkin and rolls on, wobbling. The wizard sees pumpkin-shaped stars.' },
      pull: { items: [{ e: '🧚', hat: '☕' }], label: 'A fairy on her coffee break', fx: 'sparkle', bonk: 'TWINK!',
        out: 'Her oat latte splashes everywhere (a tragedy). She turns the trolley\'s bell into a kazoo out of pure spite.' }
    },
    {
      id: 'earworm', title: 'The Earworm', theme: 'candy', pullPct: 69,
      text: 'On the main track: all the elevator music in the world. On the other: the one song that has been stuck in your head for three whole days. The trolley does not judge.',
      stay: { items: ['🎶', '🎷', '🎹'], label: 'All the elevator music in the world', bonk: 'PLINK!',
        out: 'Silence in every elevator. People make awkward eye contact. Somebody coughs. The world is slightly worse.' },
      pull: { items: ['🎵'], label: 'The song stuck in your head', bonk: 'PLINK!',
        out: 'The song is gone. Total peace. Then you start humming it again. It was inside you the whole time.' }
    },
    {
      id: 'ages', title: 'Younger You, Older You', theme: 'sunset', pullPct: 53,
      text: 'On the main track: you, age 8, with a questionable bowl haircut. On the other track: you, age 90, with the exact same haircut. Both of them say you totally have this.',
      stay: { items: [{ e: '🧒', hat: '🥣' }], label: 'You, age 8 (bowl haircut)',
        out: 'Little you sees stars and yells "COOL!" Somewhere in your timeline, the bowl haircut gets slightly better.' },
      pull: { items: [{ e: '🧓', hat: '🥣' }], label: 'You, age 90 (same haircut)',
        out: 'Old you chuckles. "I remember this one," they say, brushing off the stars. "It was fine."' }
    },
    {
      id: 'results', title: 'The Results Button', theme: 'space', pullPct: 40,
      text: 'FINAL LEVEL. The trolley is rushing toward a shiny gift-wrapped box holding your ethics results. Pull the lever to divert it into the Void of Nobody Cares, which contains three free pizzas. (Your results arrive either way. We asked the lever.)',
      stay: { items: ['🎁'], label: 'Your ethics results, gift-wrapped', fx: 'confetti', bonk: 'TA-DA!',
        out: 'The trolley slams into the box. A tiny fanfare plays. Your results are ready, and extremely well wrapped.' },
      pull: { items: rep('🍕', 3), label: 'The Void: 3 free pizzas', fx: 'sparkle', bonk: 'NOM!',
        out: 'The trolley vanishes into the Void, comes back with a pizza, and slams the results box anyway. You cannot dodge your results.' }
    }
  ];
})();
