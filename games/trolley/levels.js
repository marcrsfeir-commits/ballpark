// TROLLEY TROUBLE - level data. 42 original, silly, family-friendly dilemmas.
//
// Layout convention: the LEFT track is where the trolley is already heading ("stay" = do nothing),
// the RIGHT track is where it goes if you pull the lever ("pull").
//
//   items   : photo keys (shared/photos/<key>.webp) drawn on the track end. A string, or { e, hat } for a photo wearing a smaller one.
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
      stay: { items: rep('1f425', 5), label: '5 rubber ducks', bonk: 'SQUEAK!',
        out: 'Five ducks go squeak-squeak-squeak-squeak-squeak. It sounds like a very small orchestra tuning up.' },
      pull: { items: [{ e: '1f425', hat: '1f451' }], label: '1 rubber duck in a tiny crown', bonk: 'BONK!',
        out: 'The crown spins away like a frisbee. The duck is fine, just extremely dethroned.' }
    },
    {
      id: 'future', title: 'Future You', theme: 'sunset', pullPct: 29,
      text: 'Two strangers are arguing about pineapple on pizza, right in the trolley\'s path. Pull the lever and it heads for YOU at age 80, who time-traveled here on a hoverboard to give advice. Future you says it\'ll be fine.',
      stay: { items: ['1f9d1-200d-1f9b1', '1f355', '1f9d1-200d-1f9b0'], label: '2 strangers and 1 pineapple pizza',
        out: 'The strangers hop aside, still arguing. The pizza takes the hit. Pineapple was never going to win this one anyway.' },
      pull: { items: ['1f9d3'], label: 'Future you, age 80, on a hoverboard', fx: 'sparkle', bonk: 'ZAP!',
        out: 'Future you pops into sparkles and reappears a second later. "Worth it," they say. "Also, buy the red bike."' }
    },
    {
      id: 'sock', title: 'One Lonely Sock', theme: 'day', pullPct: 13, util: 'stay',
      text: 'The trolley is rolling toward a single sock that has been missing its partner for three years. Pull the lever to hit a perfectly matching pair of socks who are very happy together.',
      stay: { items: ['1f9e6'], label: '1 lonely sock', bonk: 'FLOMP!',
        out: 'The lonely sock goes flat. Somewhere in the dryer dimension, its partner feels a strange tingle.' },
      pull: { items: ['1f9e6', '1f9e6'], label: '2 matching socks, in love', bonk: 'FLOMP!',
        out: 'Both socks go flat together. "At least we match," whispers the left one.' }
    },
    {
      id: 'philosophers', title: 'Five Sleepy Philosophers', theme: 'night', pullPct: 76, util: 'pull',
      text: 'Five philosophers dozed off on the tracks, mid-argument about whether trolleys are even real. On the other track, one VERY awake philosopher is shouting "TROLLEYS ARE A SOCIAL CONSTRUCT!"',
      stay: { items: rep({ e: '1f634', hat: '1f393' }, 5), label: '5 sleepy philosophers',
        out: 'They wake up, brush off the stars, and agree: the trolley was real all along. Debate settled. Naps resume.' },
      pull: { items: [{ e: '1f914', hat: '1f393' }], label: '1 wide-awake philosopher',
        out: '"Interesting," he says, seeing stars. "Very real stars." He is already updating his thesis.' }
    },
    {
      id: 'delivery', title: 'Overnight Delivery', theme: 'day', pullPct: 66, util: 'pull',
      text: 'A wobbly tower of twelve packages sits on the main track while the delivery driver pretends it\'s fine. On the other track sits ONE package: your 2 a.m. impulse purchase, a banana-shaped phone.',
      stay: { items: rep('1f4e6', 6), label: 'A wobbly stack of 12 packages', badge: 'x12', fx: 'confetti', bonk: 'POP!',
        out: 'The boxes burst into bubble-wrap confetti. The driver is thrilled; they have wanted to pop that wrap all week.' },
      pull: { items: ['1f4e6'], label: '1 package: your banana phone',
        out: 'Your banana phone goes flat. Your app buzzes: "Your package has been delivered. Enjoy!"' }
    },
    {
      id: 'cat', title: 'The Cat Knows', theme: 'night', pullPct: 34,
      text: 'On one track: your laptop, with 14 unsaved tabs of homework. On the other: a cat who knows your password, your search history, and where you hid the snacks.',
      stay: { items: ['1f4bb'], label: 'Your laptop (14 unsaved tabs)',
        out: 'The laptop gives one sad *bing*. Your homework joins the great cloud in the sky. The cat looks smug.' },
      pull: { items: ['1f408'], label: 'A cat who knows your password',
        out: 'The cat does a backflip over the trolley and lands on your keyboard. Your password is now "mmmmmfish".' }
    },
    {
      id: 'monday', title: 'Monday vs Saturday', theme: 'sunset', pullPct: 6, util: 'stay',
      text: 'The trolley is heading straight for Monday, early-morning edition. Pull the lever and it flattens Saturday instead (fresh out of bed, no plans). Choose wisely, calendar-wise.',
      stay: { items: [{ e: '1f4c5', hat: '1f629' }], label: 'Monday, 7:00 a.m. edition',
        out: 'Monday goes flat. It peels itself off the track and slides under next week. It will be back. It is always back.' },
      pull: { items: ['1f3d6'], label: 'Saturday, no plans',
        out: 'Saturday goes flat. The weekend is now one day long and everybody is furious. Your phone buzzes: "Happy Monday!"' }
    },
    {
      id: 'empty', title: 'Both Tracks Empty', theme: 'desert', pullPct: 57, soft: true,
      text: 'Good news: both tracks are completely empty. The trolley is just a little lost and a little nervous. Do you pull the lever anyway?',
      stay: { items: ['1f335'], label: 'Nothing. (A cactus, maybe.)', soft: true, fx: 'sparkle', bonk: 'WHOOSH!',
        out: 'The trolley rolls past the cactus without a scratch. The cactus does not wave back. Prickly.' },
      pull: { items: ['1f343'], label: 'Nothing. (A leaf, maybe.)', soft: true, fx: 'sparkle', bonk: 'WHOOSH!',
        out: 'The trolley glides past the leaf. You pulled a lever for no reason at all, and it felt incredible.' }
    },
    {
      id: 'tortoise', title: 'The Tortoise and the Hare', theme: 'day', pullPct: 41,
      text: 'The trolley is crawling along at about walking speed. A very patient tortoise on the main track says it has "plenty of time." On the other track, a hare is already late for something.',
      stay: { items: ['1f422'], label: '1 very patient tortoise', bonk: 'BOP!',
        out: 'The tortoise pulls into its shell. "Rushing is overrated," it mumbles, and refuses to come out until Thursday.' },
      pull: { items: ['1f407'], label: '1 hare, running late', bonk: 'BOINK!',
        out: 'The hare is back on his feet in 0.2 seconds. He is still late, and now also annoyed.' }
    },
    {
      id: 'ants', title: 'A Million Ants', theme: 'desert', pullPct: 52,
      text: 'A million tiny ants are having a picnic on the main track. Pull the lever and the trolley heads for one enormous, very polite elephant who really did not plan on being in this story.',
      stay: { items: rep('1f41c', 3), label: '1,000,000 ants (they are tiny)', badge: 'x1,000,000', bonk: 'TINK!',
        out: 'A million ants launch into the sky like a very small firework. They regroup instantly and file a complaint with the ant union.' },
      pull: { items: ['1f418'], label: '1 polite elephant', bonk: 'DONK!',
        out: 'The elephant trumpets "ouch" in a surprisingly quiet voice and sees stars the size of dinner plates.' }
    },
    {
      id: 'pajamas', title: 'Pajama Hero', theme: 'night', pullPct: 71, util: 'pull',
      text: 'The trolley is heading toward five strangers stuck in one very long group hug. Or you can pull the lever and it hits YOU instead. Luckily, you are wearing extremely thick pajamas.',
      stay: { items: ['1f469-200d-1f9b0', '1f9d4', '1f467', '1f9d1-200d-1f9b3', '1f466'], label: '5 strangers in a group hug',
        out: 'They wiggle free with a collective "HEY!" You will now be known as "the one who did nothing."' },
      pull: { items: ['1f971'], label: 'YOU, in extremely thick pajamas', bonk: 'FLUMP!',
        out: 'The pajamas absorb everything. You see stars in the shape of your own face. You are a hero. A fluffy hero.' }
    },
    {
      id: 'banana', title: 'The Banana Lever', theme: 'beach', pullPct: 63, fake: true,
      text: 'Someone swapped the lever for a banana. It is probably not connected to anything. Probably. The trolley is heading toward three very trusting elves.',
      stay: { items: rep('1f9dd', 3), label: '3 trusting elves',
        out: 'The elves see stars, then see you. "We trusted the banana too," they say.' },
      pull: { items: ['1f34c'], label: 'Pull the banana (it is a banana)',
        out: 'You pull the banana. It peels. The trolley rolls on, completely unmoved, straight into the elves anyway. You are now holding a banana.' }
    },
    {
      id: 'loop', title: 'The Time Loop', theme: 'space', pullPct: 44, loop: true,
      text: 'Space is weird: both tracks loop back around. Whichever way you send it, the trolley hits the first group, zooms round, then hits the other one. The only thing you control is the ORDER.',
      stay: { items: rep('1f6a7', 5), label: '5 traffic cones (first)',
        out: 'Cones, then a loop, then one more cone. Everything got bonked. Your choice affected the order and absolutely nothing else.' },
      pull: { items: ['1f6a7'], label: '1 traffic cone (first)',
        out: 'One cone, then a loop, then five more. Same result, different vibes. Philosophers are still arguing about it.' }
    },
    {
      id: 'homework', title: 'The Homework Dog', theme: 'day', pullPct: 55,
      text: 'A spare copy of your homework (due tomorrow) lies on the main track. On the other track: the dog, who keeps swearing he ate the first copy. He is extremely fluffy and extremely unconvincing.',
      stay: { items: ['1f4da'], label: 'Your spare homework copy', fx: 'confetti', bonk: 'FWAP!',
        out: 'The homework goes flat. A teacher will never believe "a trolley ate it." (Try anyway.)' },
      pull: { items: ['1f415'], label: 'The dog (swears he ate it)', bonk: 'BOING!',
        out: 'The dog coughs up page 3. "Okay," he admits, "that one was me."' }
    },
    {
      id: 'spoiler', title: 'Spoiler Alert', theme: 'night', pullPct: 73,
      text: 'The season finale you have waited a whole year for is playing on a TV right on the main track. Pull the lever and the trolley goes for the guy who is about to say "You will NEVER guess who the villain is."',
      stay: { items: ['1f4fa'], label: 'The season finale you waited a year for', bonk: 'ZZZT!',
        out: 'The TV flickers into static. The finale is gone. The spoiler guy shrugs: "It was the butler."' },
      pull: { items: ['1f5e3'], label: 'The guy about to spoil it', bonk: 'HUSH!',
        out: 'The spoiler guy is stunned silent for a full minute. Best minute of your life. You watch the finale in peace.' }
    },
    {
      id: 'cookies', title: 'Fortune Cookies', theme: 'sunset', pullPct: 46,
      text: 'FIVE fortune cookies on the main track all say "DO NOTHING." One lone fortune cookie on the other track says "PULL THE LEVER." They are cookies. You are the one with the lever.',
      stay: { items: rep('1f960', 5), label: '5 cookies saying DO NOTHING', fx: 'confetti', bonk: 'CRUNCH!',
        out: 'Crumbs everywhere. Inside one: "You will regret taking advice from a snack."' },
      pull: { items: ['1f960'], label: '1 cookie saying PULL', fx: 'confetti', bonk: 'CRUNCH!',
        out: 'Crumbs. The little slip reads: "Well done. Or not. We are a cookie."' }
    },
    {
      id: 'mimes', title: 'Mime Time', theme: 'day', pullPct: 64, util: 'pull',
      text: 'Five mimes are stuck inside an invisible box on the main track and cannot call for help (professional pride). On the other track: one street performer holding an extremely loud megaphone.',
      stay: { items: rep('1f92b', 5), label: '5 mimes in an invisible box',
        out: 'The mimes act out "ouch" in perfect silence. It is the most expressive thing you have ever seen.' },
      pull: { items: [{ e: '1f9d1-200d-1f3a4', hat: '1f4e2' }], label: '1 street performer + megaphone', bonk: 'WEE-OOO!',
        out: 'The megaphone goes "WEEEE-OOOOO" and wakes up the entire park. Sorry, park.' }
    },
    {
      id: 'ghosts', title: 'Ghost Trolley', theme: 'spooky', pullPct: 38, soft: true, ghost: true,
      text: 'This is a ghost trolley. It passes right through everything, and the ghosts on the tracks absolutely love it. Five on the main track, one on the other. Nobody is in danger; everybody is just a little ticklish.',
      stay: { items: rep('1f47b', 5), label: '5 giggly ghosts', soft: true, fx: 'sparkle', bonk: 'WHEEE!',
        out: 'The trolley glides straight through. The ghosts giggle: "That tickles! Again! AGAIN!"' },
      pull: { items: ['1f47b'], label: '1 giggly ghost', soft: true, fx: 'sparkle', bonk: 'WHEEE!',
        out: 'The trolley glides through. The ghost whispers "boo-tiful," then bursts out laughing.' }
    },
    {
      id: 'slice', title: 'The Last Slice', theme: 'sunset', pullPct: 31,
      text: 'The last slice of pizza (the extra cheesy one) sits on the main track. Pull the lever and the trolley heads for the two friends who were just about to fight over it.',
      stay: { items: ['1f355'], label: 'The last slice (extra cheesy)', bonk: 'SPLAT!',
        out: 'The slice goes flat. The friends hug, mourn, and order another pizza. A wonderful ending.' },
      pull: { items: ['1f9d1', '1f469'], label: '2 friends about to fight over it',
        out: 'They see stars and forget what they were arguing about. You eat the last slice. Nobody saw. (We saw.)' }
    },
    {
      id: 'wifi', title: 'Neighborhood Wi-Fi', theme: 'night', pullPct: 69,
      text: 'The trolley is heading for the neighborhood Wi-Fi router. Pull the lever and it hits your neighbor\'s smart toaster instead, which has been sending very strange emails.',
      stay: { items: ['1f4e1'], label: 'The neighborhood Wi-Fi router', bonk: 'ZZZT!',
        out: 'The router goes dark. The whole street looks up from their phones, blinks, and discovers the sun. It is lovely.' },
      pull: { items: [{ e: '1f35e', hat: '1f4e7' }], label: 'A smart toaster (sends weird emails)', fx: 'confetti', bonk: 'POP!',
        out: 'The toaster launches two slices of toast into the sky. Both land butter-side up. Nobody knows what it means.' }
    },
    {
      id: 'penguins', title: 'Penguin Lawyer', theme: 'snow', pullPct: 77, util: 'pull',
      text: 'Five penguins are waiting on the tracks for a bus that never comes. One penguin on the other track is wearing a bow tie and insists it is a lawyer.',
      stay: { items: rep('1f427', 5), label: '5 penguins waiting for a bus', bonk: 'BOP!',
        out: 'The penguins slide away on their bellies shouting "WHEEE." Honestly, the best day they have had in weeks.' },
      pull: { items: [{ e: '1f427', hat: '1f380' }], label: '1 penguin in a bow tie (a lawyer)',
        out: 'The penguin straightens its tiny bow tie. "You will be hearing from my other lawyer," it says. "Also me."' }
    },
    {
      id: 'liar', title: 'The Liar Lever', theme: 'space', pullPct: 48,
      text: 'A sign on the lever says: "THIS LEVER ONLY WORKS IF YOU DON\'T PULL IT." There are three sandwiches on each track. Your move, logic.',
      stay: { items: rep('1f96a', 3), label: '3 sandwiches',
        out: 'You did nothing, so the lever works, which means you pulled it, which means it does not. The trolley splits in two. Philosophy has left the chat.' },
      pull: { items: rep('1f96a', 3), label: '3 other sandwiches (identical)',
        out: 'You pulled it, so it does not work, so the trolley goes straight, but you pulled it, so... The sandwiches survive on a technicality.' }
    },
    {
      id: 'pinata', title: 'Piñata Party', theme: 'candy', pullPct: 78, util: 'pull',
      text: 'Five kids are standing right in the trolley\'s path at a birthday party. Pull the lever and it hits the piñata on the other track instead, which absolutely explodes with candy.',
      stay: { items: ['1f467', '1f466', '1f9d2', '1f467', '1f466'], label: '5 kids at a birthday party',
        out: 'The kids sway, dizzy but giggling. "Do it again!" they shout. (Do not do it again.)' },
      pull: { items: ['1fa85'], label: '1 candy-stuffed piñata', fx: 'confetti', bonk: 'KABOOM!',
        out: 'Candy rain! The kids declare the trolley "best party guest ever." You are now a legend.' }
    },
    {
      id: 'dino', title: 'Baby Dino', theme: 'desert', pullPct: 17,
      text: 'A baby dinosaur has decided the trolley is its mom and is running toward it shouting "MOM!" On the other track: three dinosaur eggs, wobbling nervously.',
      stay: { items: ['1f996'], label: '1 baby dino (thinks the trolley is mom)', bonk: 'BOINK!',
        out: '"MOM?" squeaks the baby dino, and hops on board. The trolley now has a passenger and a mild identity crisis.' },
      pull: { items: rep('1f95a', 3), label: '3 dinosaur eggs', bonk: 'SPLAT!',
        out: 'Three eggs go sunny-side up. The baby dino cries "WHY?!" It is now an omelet situation.' }
    },
    {
      id: 'wizard', title: 'The Pumpkin Spell', theme: 'spooky', pullPct: 27,
      text: 'A wizard is halfway through a spell that turns whatever he points at into a pumpkin. Straight ahead: the wizard. Pull the lever: a fairy on her coffee break, who did not ask for any of this.',
      stay: { items: ['1f9d9'], label: 'A wizard, mid-spell', fx: 'sparkle', bonk: 'POOF!',
        out: 'The spell misfires! The trolley turns into a pumpkin and rolls on, wobbling. The wizard sees pumpkin-shaped stars.' },
      pull: { items: [{ e: '1f9da', hat: '2615' }], label: 'A fairy on her coffee break', fx: 'sparkle', bonk: 'TWINK!',
        out: 'Her oat latte splashes everywhere (a tragedy). She turns the trolley\'s bell into a kazoo out of pure spite.' }
    },
    {
      id: 'earworm', title: 'The Earworm', theme: 'candy', pullPct: 69,
      text: 'On the main track: all the elevator music in the world. On the other: the one song that has been stuck in your head for three whole days. The trolley does not judge.',
      stay: { items: ['1f3b6', '1f3b7', '1f3b9'], label: 'All the elevator music in the world', bonk: 'PLINK!',
        out: 'Silence in every elevator. People make awkward eye contact. Somebody coughs. The world is slightly worse.' },
      pull: { items: ['1f3b5'], label: 'The song stuck in your head', bonk: 'PLINK!',
        out: 'The song is gone. Total peace. Then you start humming it again. It was inside you the whole time.' }
    },
    {
      id: 'ages', title: 'Younger You, Older You', theme: 'sunset', pullPct: 53,
      text: 'On the main track: you, age 8, with a questionable bowl haircut. On the other track: you, age 90, with the exact same haircut. Both of them say you totally have this.',
      stay: { items: [{ e: '1f9d2', hat: '1f963' }], label: 'You, age 8 (bowl haircut)',
        out: 'Little you sees stars and yells "COOL!" Somewhere in your timeline, the bowl haircut gets slightly better.' },
      pull: { items: [{ e: '1f9d3', hat: '1f963' }], label: 'You, age 90 (same haircut)',
        out: 'Old you chuckles. "I remember this one," they say, brushing off the stars. "It was fine."' }
    },
    {
      id: 'snails', title: 'The Snail Grand Prix', theme: 'day', pullPct: 58, util: 'pull',
      text: 'Four racing snails are on the main track, forty minutes into a race that is two meters long. On the other track: last year\'s champion snail, resting on its trophy and refusing to sign autographs.',
      stay: { items: rep('1f40c', 4), label: '4 snails, mid-race', bonk: 'SPLORT!',
        out: 'The snails pop into their shells and roll the rest of the way. It is the fastest finish in snail racing history.' },
      pull: { items: [{ e: '1f40c', hat: '1f3c6' }], label: '1 retired champion snail', bonk: 'TONK!',
        out: 'The trophy rings like a bell. The champion peeks out, sighs, and announces a comeback tour.' }
    },
    {
      id: 'snooze', title: 'Snooze Button', theme: 'night', pullPct: 37,
      text: 'It is 5:59 a.m. The trolley is heading for your alarm clock, about to ring for school. Pull the lever and it hits your bed instead, which is still warm and extremely comfortable.',
      stay: { items: ['23f0'], label: 'Your alarm clock (rings in 1 minute)', bonk: 'BRRRING!',
        out: 'The alarm clock goes quiet forever. You sleep in until noon and wake up with the deep confusion of someone who missed something.' },
      pull: { items: ['1f6cf'], label: 'Your warm, perfect bed', bonk: 'FWUMP!',
        out: 'The bed is squashed flat as a pancake. The alarm rings. You are now awake AND bedless. Great start to the day.' }
    },
    {
      id: 'sandcastle', title: 'Sandcastle Kingdom', theme: 'beach', pullPct: 61,
      text: 'A kid spent six whole hours building a huge sandcastle, and it sits right on the main track. On the other track: three seagulls who have stolen everyone\'s fries all summer, sharing a fresh batch.',
      stay: { items: ['1f3f0'], label: '1 magnificent sandcastle', bonk: 'FLUMPH!',
        out: 'The sandcastle becomes a sand pancake. The kid immediately starts building Sandcastle Kingdom II, which is bigger.' },
      pull: { items: ['1f426', '1f35f', '1f426', '1f426'], label: '3 fry-stealing seagulls', bonk: 'SQUAWK!',
        out: 'The seagulls burst into a cloud of feathers and outrage, land three meters away, and steal more fries.' }
    },
    {
      id: 'snowmen', title: 'Snowman Family Reunion', theme: 'snow', pullPct: 72, util: 'pull',
      text: 'Four snowmen are having a family reunion on the main track. On the other track: one snowman in a top hat who says he is the mayor of winter. Nobody voted for him.',
      stay: { items: rep('26c4', 4), label: '4 snowmen at a reunion', fx: 'confetti', bonk: 'POOF!',
        out: 'Four snowmen become one giant snowball. They decide this is fine; they were always close.' },
      pull: { items: [{ e: '26c4', hat: '1f3a9' }], label: '1 self-declared mayor of winter', bonk: 'POOF!',
        out: 'The mayor rebuilds himself in four seconds flat, hat first. He blames the whole thing on spring.' }
    },
    {
      id: 'fridge', title: 'Name on the Box', theme: 'day', pullPct: 81,
      text: 'The trolley is heading for a slice of cake with YOUR name written on the box. Pull the lever and it flattens your sibling\'s sandwich instead. Their name is on that one.',
      stay: { items: ['1f370'], label: 'Your cake (labelled, obviously)', bonk: 'SPLAT!',
        out: 'Your cake is now a cake smoothie. Your sibling hands you a spoon, looking far too happy about it.' },
      pull: { items: ['1f96a'], label: 'Your sibling\'s sandwich', bonk: 'SQUISH!',
        out: 'The sandwich becomes a toasted panini. Your sibling says it actually tastes better now. You are both confused.' }
    },
    {
      id: 'robots', title: 'The Poet Robot', theme: 'space', pullPct: 49, util: 'pull',
      text: 'Five cleaning robots are rolling across the main track toward their charging dock. On the other track: one robot that taught itself to write poems. They rhyme. They are not good.',
      stay: { items: rep('1f916', 5), label: '5 cleaning robots', bonk: 'CLANK!',
        out: 'Five robots reboot at once. They forget where the dock is and clean the trolley instead. It sparkles.' },
      pull: { items: [{ e: '1f916', hat: '1f4dd' }], label: '1 robot poet', bonk: 'CLONK!',
        out: 'The robot bounces back and writes a poem about it: "Trolley came, I saw the light, now my head is not on right."' }
    },
    {
      id: 'bees', title: 'Bee Business', theme: 'day', pullPct: 74, util: 'pull',
      text: 'A whole hive of busy bees is buzzing over the main track. On the other track: one jar of the honey they made last summer. The bees would like you to know it is THEIR honey.',
      stay: { items: rep('1f41d', 3), label: 'A hive of 30,000 bees', badge: 'x30,000', soft: true, fx: 'sparkle', bonk: 'BZZZT!',
        out: 'The trolley zooms through a cloud of very annoyed bees. They file 30,000 complaints, each one a tiny buzz.' },
      pull: { items: ['1f36f'], label: '1 jar of honey', bonk: 'GLOP!',
        out: 'Honey everywhere. The trolley is now sticky forever. The bees fly over and start licking the tracks.' }
    },
    {
      id: 'chess', title: 'Checkmate in One', theme: 'night', pullPct: 45,
      text: 'On the main track: a chess game you are ONE move from winning, after three hours. On the other: a 1,000-piece jigsaw puzzle with 999 pieces done. The last piece is under the sofa.',
      stay: { items: ['265f'], label: 'Your chess game, one move from victory', fx: 'confetti', bonk: 'CLATTER!',
        out: 'Chess pieces rain down everywhere. Your opponent declares it a draw. You will be thinking about this one for years.' },
      pull: { items: ['1f9e9'], label: 'A 999/1000 jigsaw puzzle', fx: 'confetti', bonk: 'CLATTER!',
        out: 'The puzzle becomes 1,000 loose pieces again. Someone finds the missing one under the sofa. Perfect timing, honestly.' }
    },
    {
      id: 'cereal', title: 'Milk First', theme: 'sunset', pullPct: 23,
      text: 'On the main track: a bowl of cereal made the normal way. On the other track: a bowl where somebody poured the MILK first, then the cereal. It is still sitting there, judging you.',
      stay: { items: ['1f963'], label: 'Cereal, poured the normal way', bonk: 'SPLOOSH!',
        out: 'A wave of milk washes over the track. The cereal surfs it to safety, crunchy and proud.' },
      pull: { items: ['1f95b', '1f963'], label: 'Milk-first cereal', bonk: 'SPLOOSH!',
        out: 'The milk-first bowl is gone. Somewhere, a breakfast philosopher sheds a single tear of relief.' }
    },
    {
      id: 'photo', title: 'Just One More Photo', theme: 'beach', pullPct: 67,
      text: 'A family is posing for a holiday photo on the main track, smiles frozen for ten minutes. On the other track: the photographer, who keeps saying "just one more" and has taken 400.',
      stay: { items: ['1f468-200d-1f469-200d-1f467'], label: 'A family, mid-smile', bonk: 'CLICK!',
        out: 'The family gets bonked mid-smile. It becomes the best photo of the trip: total chaos, everyone laughing.' },
      pull: { items: [{ e: '1f9d1', hat: '1f4f8' }], label: 'The "one more" photographer', bonk: 'FLASH!',
        out: 'The camera flies into the air and takes one last shot: the trolley from above. Photo of the year.' }
    },
    {
      id: 'library', title: 'The Overdue Book', theme: 'sunset', pullPct: 22,
      text: 'The trolley is heading for a library book that is twelve years overdue. Pull the lever and it heads for the librarian who has waited at the door all twelve years. She has her stamp ready.',
      stay: { items: ['1f4da'], label: 'A book, 12 years overdue', bonk: 'FWAP!',
        out: 'The book flies open and lands on its last page. Now you know how it ends. You still owe the fine.' },
      pull: { items: [{ e: '1f469', hat: '1f4d6' }], label: 'The very patient librarian', bonk: 'SHHH!',
        out: 'The librarian brushes off the stars and whispers "shhh" at the trolley. It immediately rolls more quietly.' }
    },
    {
      id: 'sciencefair', title: 'Science Fair Panic', theme: 'desert', pullPct: 47,
      text: 'Two minutes before judging, your baking-soda volcano sits on the main track. On the other track: last year\'s winner, a potato battery that lights one very small bulb.',
      stay: { items: ['1f30b'], label: 'Your baking-soda volcano', fx: 'confetti', bonk: 'FIZZ!',
        out: 'The volcano erupts in fizzy foam all over the trolley. The judges think it was planned and give you first place.' },
      pull: { items: ['1f954', '1f50b', '1f4a1'], label: 'The potato battery', bonk: 'BZAP!',
        out: 'The potato goes flying and the bulb flickers out. The trolley\'s headlights come on instead. Science is weird.' }
    },
    {
      id: 'kites', title: 'Kite Day', theme: 'day', pullPct: 39, util: 'pull',
      text: 'On the main track: four kites hopelessly tangled together, strings knotted beyond repair. On the other track: one perfect kite, flying high on the first try. Its owner is so proud.',
      stay: { items: rep('1fa81', 4), label: '4 hopelessly tangled kites', bonk: 'TWANG!',
        out: 'The trolley untangles all four kites in one go. They fly off together, friends forever. Nobody can explain it.' },
      pull: { items: ['1fa81'], label: '1 perfect kite', bonk: 'TWANG!',
        out: 'The kite string catches the trolley, which floats gently off the tracks for one second. Best day ever, for the trolley.' }
    },
    {
      id: 'bats', title: 'The Bat Choir', theme: 'spooky', pullPct: 79, util: 'pull',
      text: 'Five bats are rehearsing an upside-down choir concert on the main track. On the other track: a jack-o\'-lantern somebody spent three whole hours carving. It has eyebrows.',
      stay: { items: rep('1f987', 5), label: '5 bats in a choir', soft: true, fx: 'sparkle', bonk: 'EEEEK!',
        out: 'The bats scatter and hit a perfect high note on the way up. Their best rehearsal yet.' },
      pull: { items: ['1f383'], label: '1 very detailed jack-o\'-lantern', bonk: 'SQUELCH!',
        out: 'Pumpkin soup for everyone! The eyebrows survive, somehow, and get framed.' }
    },
    {
      id: 'results', title: 'The Results Button', theme: 'space', pullPct: 40,
      text: 'FINAL LEVEL. The trolley is rushing toward a shiny gift-wrapped box holding your ethics results. Pull the lever to divert it into the Void of Nobody Cares, which contains three free pizzas. (Your results arrive either way. We asked the lever.)',
      stay: { items: ['1f381'], label: 'Your ethics results, gift-wrapped', fx: 'confetti', bonk: 'TA-DA!',
        out: 'The trolley slams into the box. A tiny fanfare plays. Your results are ready, and extremely well wrapped.' },
      pull: { items: rep('1f355', 3), label: 'The Void: 3 free pizzas', fx: 'sparkle', bonk: 'NOM!',
        out: 'The trolley vanishes into the Void, comes back with a pizza, and slams the results box anyway. You cannot dodge your results.' }
    }
  ];
})();
