import type { Structure, SystemId } from './types';
import { hasUnresolvedAtlasLabel } from './study';

export interface QuickInfo {
  topic: string;
  scope: 'overview' | 'source-action' | 'general' | 'unresolved';
  sentences: string[];
  reference: { title: string; url: string };
  reviewed: false;
}
const base='https://training.seer.cancer.gov/anatomy/';
const references={
  body:['Body systems',''], axial:['Axial skeleton','skeletal/divisions/axial.html'], limb:['Limb bones','skeletal/divisions/appendicular.html'],
  joint:['Joints','skeletal/articulations.html'], tissue:['Connective tissue','cells_tissues_membranes/tissues/connective.html'],
  muscle:['Muscles','muscular/'], nerve:['Peripheral nerves','nervous/organization/pns.html'], brain:['Brain and spinal cord','nervous/organization/cns.html'],
  vessel:['Blood vessels','cardiovascular/blood/classification.html'], heart:['Heart structure','cardiovascular/heart/structure.html'], rhythm:['Heart rhythm','cardiovascular/heart/physiology.html'],
  lymph:['Lymphatic structures','lymphatic/components/'], airway:['Voice box and windpipe','respiratory/passages/larynx.html'], lung:['Lungs and airways','respiratory/passages/bronchi.html'],
  digestive:['Digestive system','digestive/'], accessory:['Digestive glands','digestive/regions/accessory.html'], kidney:['Kidneys','urinary/components/kidney.html'], urinary:['Urinary system','urinary/'],
  endocrine:['Hormone-producing glands','endocrine/'], thyroid:['Thyroid and parathyroid','endocrine/glands/thyroid.html'], adrenal:['Adrenal glands','endocrine/glands/adrenal.html'],
  reproductive:['Reproductive system','reproductive/'], duct:['Male reproductive ducts','reproductive/male/duct.html'], maleGland:['Male reproductive glands','reproductive/male/glands.html'], tract:['Female reproductive tract','reproductive/female/tract.html'], breast:['Breast structures','reproductive/female/glands.html'],
  atlas:['Atlas muscle action (source catalogue)','/data/atlas.json'],
  eye:['NIH / NEI · How the eyes work','https://www.nei.nih.gov/eye-health-information/healthy-vision/how-eyes-work'],
  hearing:['NIH / NIDCD · How we hear','https://www.nidcd.nih.gov/health/how-do-we-hear'],
  brainBasics:['NIH / NIMH · Get to know your brain','https://www.nimh.nih.gov/news/media/2023/get-to-know-your-brain'],
} as const;
type Ref=keyof typeof references;
type Kind='artery'|'vein'|'nerve'|'bone'|'muscle'|'ligament'|'tendon'|'cartilage'|'fascia'|'fat'|'node'|'lymph-vessel'|'other';
function result(topic:string,sentences:string[],ref:Ref,scope:QuickInfo['scope']='overview'):QuickInfo{
  const [title,path]=references[ref];return{topic,sentences,scope,reviewed:false,reference:{title:['atlas','eye','hearing','brainBasics'].includes(ref)?title:`NIH / NCI · ${title}`,url:/^(?:https:\/\/|\/)/.test(path)?path:base+path}};
}
// Classify by the actual tissue label before using its system. For example,
// a renal artery is a vessel, and thyroid cartilage is not the thyroid gland.
export function structureKind(s:Structure):Kind{
  const n=s.name.toLowerCase(),g=s.groupName;
  if(g==='Arteries'||/\barter(?:y|ies|ial)\b|\baorta\b/.test(n))return'artery';
  if(g==='Veins'||/\bvein|\bvenous\b|vena cava|coronary sinus/.test(n))return'vein';
  if(/\blymph\s*node|lymphnode|\bnodes?\b/.test(n)&&s.system==='lymphatic')return'node';
  if(s.system==='lymphatic'&&/lymphatic|thoracic duct|cisterna chyli|trunk/.test(n))return'lymph-vessel';
  if(/\btendon\b|aponeurosis/.test(n))return'tendon';
  if(/\bligament|retinacul/.test(n)||g==='Ligaments'&&!/bursa|labrum|meniscus|disc|membrane|cartilage|symphysis/i.test(n))return'ligament';
  if(/cartilage|labrum|meniscus|menisci|intervertebral dis[ck]|pubic symphysis/.test(n))return'cartilage';
  if(/fascia/.test(n))return'fascia';
  if(/adipose|\bfat\b/.test(n))return'fat';
  if(g==='Muscles'||s.system==='muscular'||/\bmuscle\b/.test(n))return'muscle';
  if(/dura mater|pia mater|arachnoid|choroid plexus|spinal cord/.test(n))return'other';
  if(g==='Nerves'||/\bnerve|\bplexus|\bgangli|rami communicantes|sympathetic trunk/.test(n))return'nerve';
  if((g==='Bones'||s.system==='skeletal')&&!/bursa|membrane|joint|teeth|tooth|incisor|molar|canine/.test(n))return'bone';
  return'other';
}
interface Topic {id:string;match:RegExp;kind?:Kind;system?:SystemId;ref:Ref;lines:[string,string];}
const topics:Topic[]=[
  {id:'teeth',match:/tooth|teeth|incisor|molar|canine/,system:'skeletal',ref:'digestive',lines:['Teeth cut, tear and grind food into smaller pieces.','This makes food easier to swallow and gives digestive enzymes more surface to work on.']},
  {id:'cerebellum',match:/cerebellum|flocculus/,system:'nervous',ref:'brainBasics',lines:['The cerebellum helps coordinate movements and maintain balance.','It helps make movements smooth and accurate.']},
  {id:'choroid-plexus',match:/choroid plexus/,system:'nervous',ref:'brain',lines:['The choroid plexus is tissue inside the brain’s fluid-filled ventricles.','It produces much of the cerebrospinal fluid that cushions the brain and spinal cord.']},
  {id:'eye',match:/^eyeball/,system:'nervous',ref:'eye',lines:['The eye collects light and focuses it onto the retina at the back.','The retina turns light into signals that travel toward the brain.']},
  {id:'iris-pupil',match:/^iris$|^pupil$/,system:'nervous',ref:'eye',lines:['The iris is the coloured part of the eye, and the pupil is its central opening.','Changing the pupil’s size controls how much light enters the eye.']},
  {id:'retina',match:/^retina$/,system:'nervous',ref:'eye',lines:['The retina is the light-sensitive layer at the back of the eye.','It changes light into electrical signals that travel toward the brain.']},
  {id:'optic-nerve',kind:'nerve',match:/optic(?:al)? nerve/,ref:'eye',lines:['The optic nerve carries visual signals from the retina toward the brain.','These signals are part of the pathway that lets you see.']},
  {id:'ear-drum',match:/tympanic membrane/,system:'nervous',ref:'hearing',lines:['The tympanic membrane is the eardrum.','Sound makes it vibrate, passing movement to the tiny bones of the middle ear.']},
  {id:'ear-bones',match:/^malleus$|^incus$|^stapes$/,system:'nervous',ref:'hearing',lines:['The malleus, incus and stapes are three tiny bones in the middle ear.','They pass and amplify sound vibrations toward the inner ear.']},
  {id:'cochlea',match:/cochlea/,system:'nervous',ref:'hearing',lines:['The cochlea is the coiled hearing part of the inner ear.','Its sensory cells turn vibrations into electrical signals for the brain.']},
  {id:'pharynx',match:/pharynx|pharinx/,system:'digestive',ref:'digestive',lines:['The pharynx is the throat behind the nose and mouth.','It forms a shared region for breathing and swallowing before air and food take separate routes.']},
  {id:'tongue',match:/^tongue$/,system:'digestive',ref:'digestive',lines:['The tongue moves food around the mouth and helps push it back for swallowing.','It also helps with taste and making speech sounds.']},
  {id:'spleen',match:/^spleen$/,system:'lymphatic',ref:'lymph',lines:['The spleen filters blood and removes old or damaged blood cells.','It also contains immune cells that respond to material carried in the blood.']},
  {id:'thymus',match:/^thymus/,system:'lymphatic',ref:'lymph',lines:['The thymus is an immune organ behind the breastbone.','It supports the development of T cells, which help the body recognise and respond to threats.']},
  {id:'tonsil',match:/tonsil/,system:'lymphatic',ref:'lymph',lines:['Tonsils are patches of immune tissue near the entrance to the throat.','They help respond to material entering through the mouth and nose.']},
  {id:'bursa',match:/bursa/,system:'skeletal',ref:'joint',lines:['A bursa is a small fluid-containing sac near a joint.','It reduces rubbing between moving structures such as a tendon and bone.']},
  {id:'articular-disc',match:/articular disc/,system:'skeletal',ref:'joint',lines:['An articular disc is a pad of cartilage inside certain joints.','It helps the joint surfaces fit together and spreads the forces passing through them.']},
  {id:'synovial-membrane',match:/synovial membrane/,system:'skeletal',ref:'joint',lines:['The synovial membrane lines the inside of many joint capsules.','It makes synovial fluid, which helps the joint surfaces move smoothly.']},
  {id:'support-membrane',match:/membrane/,system:'skeletal',ref:'tissue',lines:['This is a supporting sheet of connective tissue.','Sheets like this help connect or reinforce neighbouring structures.']},
  {id:'omentum',match:/omentum|mesenter|mesocolon/,system:'digestive',ref:'digestive',lines:['These are folds of the membrane lining the abdominal cavity.','They support digestive organs and provide routes for blood vessels, lymphatics and nerves.']},
  {id:'testis',match:/^testis\b|^testicle\b/,system:'reproductive',ref:'reproductive',lines:['The testes produce sperm and the hormone testosterone.','Coiled tubes inside each testis are where sperm develop.']},
  {id:'erectile-tissue',match:/corpus spongiosum|corpus cavern|crus of clitoris|bulb of vestibule|^clitoris$|^glans penis$/,system:'reproductive',ref:'reproductive',lines:['Erectile tissue contains spaces that can fill with blood.','Increased blood filling makes this tissue firmer during sexual arousal.']},
  {id:'vulva',match:/^vulva$/,system:'reproductive',ref:'reproductive',lines:['The vulva is the external female genital region.','It includes structures around the openings of the urethra and vagina.']},
  {id:'pulmonary-artery',kind:'artery',match:/pulmonary/,ref:'vessel',lines:['Pulmonary arteries take blood from the heart to the lungs.','This blood is low in oxygen and picks up oxygen in the lungs.']},
  {id:'pulmonary-vein',kind:'vein',match:/pulmonary/,ref:'vessel',lines:['Pulmonary veins bring blood back from the lungs to the heart.','Unlike most veins, they carry blood rich in oxygen.']},
  {id:'portal-vein',kind:'vein',match:/portal/,ref:'accessory',lines:['The hepatic portal vein carries blood from digestive organs to the liver.','The liver processes absorbed nutrients before this blood returns to the wider circulation.']},
  {id:'coronary-artery',kind:'artery',match:/coronary|cardiac/,ref:'heart',lines:['These vessels supply the heart muscle itself.','The muscle needs a steady blood supply to keep pumping.']},
  {id:'cardiac-vein',kind:'vein',match:/coronary|cardiac/,ref:'heart',lines:['These veins collect blood from the heart muscle.','They form part of the route that returns this blood to the right side of the heart.']},
  {id:'aorta',kind:'artery',match:/\baorta\b/,ref:'vessel',lines:['The aorta is the main artery leaving the left side of the heart.','Its branches distribute blood to the body.']},
  {id:'vena-cava',kind:'vein',match:/vena cava/,ref:'heart',lines:['The venae cavae are the large veins entering the right atrium.','They return blood from the body to the heart.']},
  {id:'sa-node',match:/sinoatrial|sinu.?atrial|\bsa node\b/,system:'nervous',ref:'rhythm',lines:['The SA node is the heart’s natural pacemaker.','It starts the electrical signal for each normal heartbeat.']},
  {id:'av-node',match:/atrioventricular node|\bav node\b/,system:'nervous',ref:'rhythm',lines:['The AV node passes the heart’s electrical signal toward the ventricles.','A short delay gives the ventricles time to fill before they squeeze.']},
  {id:'conduction',match:/his bundle|purkinje|internodal|bachmann|bundle \(left|^left bundle|^right bundle/,system:'nervous',ref:'rhythm',lines:['This is part of the heart’s electrical conduction network.','The network coordinates the timing of the heart chambers’ contractions.']},
  {id:'right-atrium',match:/right atrium/,system:'cardiovascular',ref:'heart',lines:['The right atrium is an upper chamber of the heart.','It receives blood returning from the body and passes it to the right ventricle.']},
  {id:'left-atrium',match:/left atrium/,system:'cardiovascular',ref:'heart',lines:['The left atrium is an upper chamber of the heart.','It receives blood from the lungs and passes it to the left ventricle.']},
  {id:'heart-ventricle',match:/ventricl/,system:'cardiovascular',ref:'heart',lines:['The ventricles are the lower pumping chambers of the heart.','The right one pumps toward the lungs; the left one pumps toward the body.']},
  {id:'heart-valve',match:/tricuspid|mitral|\bvalve\b/,system:'cardiovascular',ref:'heart',lines:['A heart valve works like a one-way door for blood.','It opens and closes as pressure changes, helping stop blood flowing backward.']},
  {id:'heart',match:/\bheart\b/,system:'cardiovascular',ref:'heart',lines:['The heart is a muscular pump in the chest.','Its right side sends blood to the lungs, and its left side sends blood to the body.']},
  {id:'femur',kind:'bone',match:/femur|femoral/,ref:'limb',lines:['The femur is the thigh bone, between the hip and knee.','It supports body weight and gives leg muscles places to attach.']},
  {id:'humerus',kind:'bone',match:/humerus|humeral/,ref:'limb',lines:['The humerus is the long bone of the upper arm.','It links the shoulder with the elbow and provides muscle attachment points.']},
  {id:'radius',kind:'bone',match:/\bradius\b/,ref:'limb',lines:['The radius lies on the thumb side of the forearm in the anatomical position.','It works with the ulna when you turn your palm up or down.']},
  {id:'ulna',kind:'bone',match:/\bulna\b/,ref:'limb',lines:['The ulna lies on the little-finger side of the forearm in the anatomical position.','Its upper end forms the main bony hinge of the elbow.']},
  {id:'tibia',kind:'bone',match:/\btibia\b/,ref:'limb',lines:['The tibia is the larger shin bone on the inner side of the lower leg.','It carries weight between the knee and ankle.']},
  {id:'fibula',kind:'bone',match:/\bfibula\b/,ref:'limb',lines:['The fibula is the thinner bone on the outer side of the lower leg.','It helps steady the ankle and gives muscles attachment points.']},
  {id:'patella',kind:'bone',match:/patella/,ref:'limb',lines:['The patella is the kneecap at the front of the knee.','It helps the thigh muscles straighten the knee more effectively.']},
  {id:'scapula',kind:'bone',match:/scapula/,ref:'limb',lines:['The scapula is the shoulder blade on the back of the chest.','It forms the socket for the upper arm and anchors many shoulder muscles.']},
  {id:'clavicle',kind:'bone',match:/clavicle/,ref:'limb',lines:['The clavicle is the collarbone at the front of the shoulder.','It links the shoulder blade to the breastbone and helps hold the shoulder out from the chest.']},
  {id:'hip-bone',kind:'bone',match:/hip bone|\bilium\b|\bischium\b|\bpubis\b/,ref:'limb',lines:['The hip bones form the sides of the pelvis and the sockets of the hip joints.','They transfer body weight to the legs and help protect pelvic organs.']},
  {id:'hand-bones',kind:'bone',match:/carpal|scaphoid|lunate|triquetr|pisiform|trapez|capitate|hamate|metacarp/,ref:'limb',lines:['This bone belongs to the wrist or hand.','These small bones provide support while allowing the hand to bend, grip and make precise movements.']},
  {id:'foot-bones',kind:'bone',match:/tarsal|\btalus\b|calcaneus|navicular|cuboid|cuneiform|metatars/,ref:'limb',lines:['This bone belongs to the ankle or foot.','Together, the foot bones support body weight and help balance and push the body forward during walking.']},
  {id:'phalanges',kind:'bone',match:/phalan|phalange/,ref:'limb',lines:['Phalanges are the bones of the fingers and toes.','Their joints let the digits bend for gripping or for balance and walking.']},
  {id:'vertebra',kind:'bone',match:/vertebr|atlas.*c1|axis.*c2/,ref:'axial',lines:['Vertebrae are the bones that form the backbone.','They support the trunk and surround the passage containing the spinal cord.']},
  {id:'sacrum-coccyx',kind:'bone',match:/sacrum|coccyx/,ref:'axial',lines:['The sacrum and coccyx form the lower end of the spine.','They provide support and attachment points around the pelvis.']},
  {id:'rib-sternum',kind:'bone',match:/\bribs?\b|sternum|manubrium|xiphoid/,ref:'axial',lines:['The ribs and breastbone form much of the chest’s protective cage.','This cage surrounds the heart and lungs and moves during breathing.']},
  {id:'jaw',kind:'bone',match:/mandible|maxilla/,ref:'axial',lines:['The upper and lower jaws hold the teeth and shape the mouth.','The lower jaw moves during chewing and speaking.']},
  {id:'hyoid',kind:'bone',match:/hyoid/,ref:'axial',lines:['The hyoid is a small bone high in the front of the neck.','It anchors muscles used by the tongue and during swallowing.']},
  {id:'skull',kind:'bone',match:/skull|cran|frontal|parietal|temporal|occipital|sphenoid|ethmoid|zygomatic|vomer|palatine|nasal bone|lacrimal bone/,ref:'axial',lines:['The skull’s bones protect the brain and form the framework of the face.','Openings in these bones allow nerves and blood vessels to pass through.']},
  {id:'brain-ventricles',match:/ventricl/,system:'nervous',ref:'brain',lines:['Brain ventricles are connected spaces containing cerebrospinal fluid.','This fluid surrounds and cushions the brain and spinal cord.']},
  {id:'corpus-callosum',match:/corpus callosum/,system:'nervous',ref:'brain',lines:['The corpus callosum is a large band of nerve fibres deep in the brain.','It lets the left and right cerebral hemispheres exchange information.']},
  {id:'thalamus',match:/^thalamus\b/,system:'nervous',ref:'brain',lines:['The thalamus is a relay centre deep inside the brain.','It passes most sensory information toward the outer thinking layer of the brain.']},
  {id:'brainstem',match:/brainstem|brain stem|medulla oblongata|^pons\b/,system:'nervous',ref:'brain',lines:['The brainstem connects the brain with the spinal cord.','It carries messages between them and contains centres for vital automatic activities.']},
  {id:'cerebrum',match:/cerebral hemisphere|\bcerebrum\b/,system:'nervous',ref:'brain',lines:['The cerebral hemispheres make up the largest part of the brain.','Their outer layer processes information involved in sensation, thought and voluntary movement.']},
  {id:'meninges',match:/dura mater|pia mater|arachnoid|falx cere|tentorium/,system:'nervous',ref:'brain',lines:['The meninges are protective layers around the brain and spinal cord.','Some parts of the tough outer layer also form supporting partitions inside the skull.']},
  {id:'spinal-cord',match:/spinal cord|cauda equina/,system:'nervous',ref:'brain',lines:['The spinal cord carries messages between the brain and the body and helps produce reflexes.','Below its lower end, spinal nerve roots continue as a bundle called the cauda equina.']},
  {id:'lung',match:/lung|\bbronch/,system:'respiratory',ref:'lung',lines:['The lungs contain tiny air sacs where oxygen moves into the blood and carbon dioxide moves out.','Branching airways bring air to these gas-exchange surfaces.']},
  {id:'trachea',match:/trachea/,system:'respiratory',ref:'airway',lines:['The trachea is the windpipe carrying air toward the lungs.','Rings of cartilage help keep this airway open.']},
  {id:'epiglottis',match:/^epiglottis\b/,system:'respiratory',ref:'airway',lines:['The epiglottis is a flap near the entrance to the voice box.','During swallowing it helps protect the airway from food and drink.']},
  {id:'larynx',match:/vocal|arytenoid|crico|thyroid cartilage|thyrohyoid|quadrangular membrane|vestibular ligament|cuneiform cartilage|triticeal/,system:'respiratory',ref:'airway',lines:['This structure helps form or control the voice box, called the larynx.','The larynx provides an air passage, produces voice and helps protect the airway during swallowing.']},
  {id:'kidney',match:/^kidney\b|^nephron\b|renal pyramid|pyramids|renal papilla|renal pelvis/,system:'urinary',ref:'kidney',lines:['The kidneys filter the blood and adjust the amount of water and salts kept in the body.','Filtering units make urine, which drains through collecting passages toward the ureter.']},
  {id:'ureter',match:/\bureter\b/,system:'urinary',ref:'urinary',lines:['A ureter is a tube connecting a kidney to the bladder.','Waves of muscle contraction push urine down it.']},
  {id:'bladder',match:/bladder|detrusor/,system:'urinary',ref:'urinary',lines:['The bladder stores urine until you are ready to pass it.','Its muscular wall, the detrusor, squeezes to help empty it.']},
  {id:'urethra',match:/urethra|urethral/,system:'urinary',ref:'urinary',lines:['The urethra is the passage through which urine leaves the bladder.','Sphincter muscles around this passage help control urine release.']},
  {id:'liver',match:/^liver$/,system:'digestive',ref:'accessory',lines:['The liver processes nutrients carried from the gut and makes bile.','Bile helps the digestive system handle fats.']},
  {id:'gallbladder',match:/gallbladder/,system:'digestive',ref:'accessory',lines:['The gallbladder is a small sac under the liver.','It stores and concentrates bile, then releases it into the digestive tract.']},
  {id:'pancreatic-duct',match:/pancreatic duct/,system:'digestive',ref:'accessory',lines:['Pancreatic ducts carry digestive juice from the pancreas toward the small intestine.','The enzymes in this juice help break down food.']},
  {id:'pancreas',match:/^pancreas$/,ref:'accessory',lines:['The pancreas makes digestive enzymes that help break down food.','It also makes hormones, including insulin, that help control blood sugar.']},
  {id:'salivary',match:/parotid|sublingual|submandibular/,system:'digestive',ref:'accessory',lines:['The salivary glands make saliva, and their ducts carry it into the mouth.','Saliva moistens food and starts the digestion of starch.']},
  {id:'esophagus',match:/esophagus|oesophagus/,system:'digestive',ref:'digestive',lines:['The esophagus is the food pipe between the throat and stomach.','Its muscles push swallowed food toward the stomach.']},
  {id:'stomach',match:/stomach/,system:'digestive',ref:'digestive',lines:['The stomach stores and mixes swallowed food.','Acid and enzymes start breaking down proteins before food moves into the small intestine.']},
  {id:'small-intestine',match:/duodenum|jejunum|ileum|small intestine/,system:'digestive',ref:'digestive',lines:['The small intestine is where most digestion and nutrient absorption take place.','Its first part is the duodenum, followed by the jejunum and ileum.']},
  {id:'large-intestine',match:/colon|large intestine|rectum/,system:'digestive',ref:'digestive',lines:['The large intestine absorbs remaining water and helps form stool.','The rectum holds stool before it leaves the body.']},
  {id:'thyroid',match:/^thyroid(?: gland)?$/,ref:'thyroid',lines:['The thyroid is a hormone-producing gland at the front of the neck.','Its hormones help set the pace at which the body uses energy.']},
  {id:'parathyroid',match:/parathyroid/,ref:'thyroid',lines:['The parathyroids are small glands usually found behind the thyroid.','Their hormone helps regulate calcium levels in the blood.']},
  {id:'adrenal',match:/suprarenal|adrenal/,system:'endocrine',ref:'adrenal',lines:['The adrenal glands sit above the kidneys.','Their hormones help regulate the stress response, blood pressure and salt balance.']},
  {id:'epididymis',match:/^epididymis(?:\b|$)/,system:'reproductive',ref:'duct',lines:['The epididymis is a coiled tube along the testis.','Sperm mature and are stored there before moving into the ductus deferens.']},
  {id:'deferens',match:/ductus deferens|ejaculatory duct/,system:'reproductive',ref:'duct',lines:['These ducts form part of the route carrying sperm toward the urethra.','Their role is transport, rather than sperm production.']},
  {id:'male-glands',match:/prostate|seminal vesicle|seminal gland|bulbo.?urethral/,system:'reproductive',ref:'maleGland',lines:['These reproductive glands add fluid to semen.','The fluids help support sperm and their passage through the reproductive tract.']},
  {id:'ovary',match:/^ovary(?:\b|$)/,system:'reproductive',ref:'reproductive',lines:['The ovaries produce egg cells and hormones such as estrogen and progesterone.','They take part in the menstrual cycle and reproduction.']},
  {id:'uterine-tube',match:/uterine tube|fallopian/,system:'reproductive',ref:'tract',lines:['The uterine tubes connect the region near each ovary with the uterus.','They transport the egg, and fertilization usually happens within a tube.']},
  {id:'uterus-vagina',match:/^uterus|^vagina/,system:'reproductive',ref:'tract',lines:['The uterus is the womb where an embryo can develop during pregnancy.','The vagina is the passage connecting the cervix of the uterus to the outside.']},
  {id:'breast',match:/mammary|lactiferous/,system:'reproductive',ref:'breast',lines:['Milk is made in the glandular parts of the breast.','Lactiferous ducts carry that milk toward the nipple.']},
];

const systemRefs:Record<SystemId,Ref>={skeletal:'axial',muscular:'muscle',cardiovascular:'vessel',nervous:'brain',respiratory:'lung',digestive:'digestive',urinary:'urinary',reproductive:'reproductive',lymphatic:'lymph',endocrine:'endocrine'};
const systemContext:Record<SystemId,[string,string]>={
  skeletal:['The skeleton supports the body and protects important organs.','Its bones and supporting tissues also provide a framework for movement.'],
  muscular:['Muscles produce force by contracting.','Working with their attachments, they help move and support the body.'],
  cardiovascular:['The heart and blood vessels circulate blood through the body.','This circulation delivers oxygen and nutrients and carries waste products away.'],
  nervous:['The nervous system carries and processes information.','It helps coordinate sensation, movement and automatic body functions.'],
  respiratory:['The respiratory system brings air to the lungs.','There, oxygen enters the blood and carbon dioxide moves out.'],
  digestive:['The digestive system breaks food down into smaller substances.','Nutrients and water can then be absorbed for the body to use.'],
  urinary:['The urinary system makes, transports, stores and releases urine.','This helps remove waste and regulate the body’s water and salt balance.'],
  reproductive:['Reproductive structures help make or transport reproductive cells, produce hormones or support reproduction.','Different structures have different roles within this system.'],
  lymphatic:['The lymphatic system returns extra tissue fluid to the bloodstream.','It also includes immune organs that help the body respond to foreign material.'],
  endocrine:['Endocrine glands release hormones into the blood.','These chemical messages help coordinate activities such as growth, energy use and reproduction.'],
};
const general:Record<Kind,[string,string,Ref]>={
  artery:['Arteries carry blood away from the heart.','Their smaller branches deliver blood toward the tissues they supply.','vessel'],
  vein:['Veins carry blood toward the heart.','Some veins first drain into other veins or through an organ before this blood reaches the heart.','vessel'],
  nerve:['Nerves contain bundles of fibres that carry electrical messages.','The exact job of a nerve or branch depends on where its fibres go.','nerve'],
  bone:['Bone forms the supporting framework of the body.','Bony surfaces also provide places for muscles and other supporting tissues to attach.','axial'],
  muscle:['Muscles produce force by contracting, or shortening.','They pull on their attachments to move or hold a body part.','muscle'],
  ligament:['A ligament is a strong band of supporting connective tissue.','Depending on its location, it helps steady a joint or support an organ.','tissue'],
  tendon:['A tendon is a tough connection that carries a muscle’s pulling force to its attachment.','This force helps move or steady a body part.','tissue'],
  cartilage:['Cartilage is firm but flexible supporting tissue.','Its job depends on its location, such as supporting an airway or helping a joint move smoothly.','tissue'],
  fascia:['Fascia is connective tissue that wraps around and separates body structures.','It helps support muscles and organise nearby tissues into layers.','tissue'],
  fat:['Fat tissue stores energy and cushions nearby structures.','Its location determines how much it contributes to padding, support or insulation.','tissue'],
  node:['A lymph node filters lymph, the fluid collected from body tissues.','Immune cells inside it help recognise and respond to foreign material.','lymph'],
  'lymph-vessel':['Lymphatic vessels collect extra fluid from body tissues.','They carry this fluid through the lymphatic network and eventually back into the bloodstream.','lymph'],
  other:['This is a labelled part of the selected body system.','Its precise function needs a structure-specific explanation; use the reference below for the system overview.','body'],
};

/** Translate only a complete, short source action; leave the full original below. */
function simpleAction(s:Structure):string|undefined{
  const raw=s.details?.action?.trim();if(!raw||/^n\/?a\b/i.test(raw)||/male:|female:|\|/i.test(raw))return;
  const first=raw.split(';')[0].trim();
  const verbs:Record<string,string>={flexes:'bends',extends:'straightens',elevates:'raises',depresses:'lowers',supports:'supports',stabilizes:'steadies',closes:'closes',opens:'opens',compresses:'presses on',rotates:'turns',pulls:'pulls',assists:'helps',protects:'protects'};
  const match=first.match(/^(\w+)\s+(.+)$/);if(!match||!verbs[match[1].toLowerCase()]||first.length>195)return;
  const action=(verbs[match[1].toLowerCase()]+' '+match[2]).replace(/\bpelvic viscera\b/gi,'organs in the pelvis').replace(/\bdeglutition\b/gi,'swallowing').replace(/\brespiration\b/gi,'breathing').replace(/\bmandible\b/gi,'lower jaw').replace(/\bhumerus\b/gi,'upper arm bone').replace(/\bbilateral contraction\b/gi,'both sides working together').replace(/\bunilateral contraction\b/gi,'one side working').replace(/[.\s]+$/,'');
  return 'It '+action.replace(/\bforearm\b/g,'the forearm').replace(/\blower jaw\b/g,'the lower jaw').replace(/\bupper arm bone\b/g,'the upper arm bone')+'.';
}

export function getQuickInfo(s:Structure):QuickInfo{
  if(hasUnresolvedAtlasLabel(s))return result('unresolved',['This part still has an unresolved source label.','Its identity needs checking before a function can be described.'],'atlas','unresolved');
  const name=s.name.replace(/_/g,' ').replace(/\s+/g,' ').trim().toLowerCase().replace(/ \((?:alternate surface|section|sectioned|right|left)\)/g,'').replace(/,? (?:right|left)$/,'');
  const kind=structureKind(s);
  // Vessels and nerves must not inherit an organ’s explanation just because
  // its name contains that organ (renal artery, thyroid vein, gastric nerve).
  const topic=topics.find(t=>t.match.test(name)&&(!t.kind||t.kind===kind)&&(!t.system||t.system===s.system)&&(!['artery','vein','nerve','ligament','tendon','fat','fascia'].includes(kind)||t.kind===kind||t.system==='nervous'&&/node|conduction/.test(t.id)));
  if(topic)return result(topic.id,[...topic.lines],topic.ref);
  if(kind==='muscle'){const action=simpleAction(s);if(action)return result('source-muscle-action',['This muscle creates force by pulling on its attachments.',action],'atlas','source-action');}
  const [first,second,ref]=general[kind];
  return result('general-'+kind,kind==='other'?[...systemContext[s.system]]:[first,second],kind==='other'?systemRefs[s.system]:ref,'general');
}
