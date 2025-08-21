
import React, { useState } from 'react';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { CalculatorState, CalculatorContact } from '@/types';
import { CALCULATOR_STEPS, PRICE_MAP, PRICE_MODIFIERS } from '@/constants';
import { sendMail } from '@/services/firebaseMail';
import { reportConversion, FORM_CONVERSION_LABEL } from '@/services/googleAds';

/* ────────────────────────────────────────────────────────────────────────── */
/* CONFIG & HELPERS                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

const initialCalculatorState: CalculatorState = {
  mission: 'locatif',
  typeBien: 'appartement',
  chambres: 1,
  sdb: 1,
  meuble: false,
  jardin: false,
  frais: '2parties',
  surface: 300,
  facades: 1,
  recolement: false,
  autres_pieces: 0,
  mobilier: false,
  chambres_communautaire: 1,
};

const missionDetailOptions: Record<CalculatorState['mission'], string[]> = {
  locatif: ["un état des lieux d'entrée", "un état des lieux de sortie"],
  'avant-travaux': ["une mission avant travaux"],
  reception: ["une réception provisoire"],
  acquisitif: ["une mission acquisitive"],
  'permis-location': ["un permis de location"],
};

type TabDef = {
  id: string;
  label: string;
  mission: CalculatorState['mission'];
  detail: string;
};

const TABS: TabDef[] = [
  { id: 'tab-locatif', label: "Locatif", mission: 'locatif', detail: "un état des lieux d'entrée" },
  { id: 'tab-avant', label: "Avant Travaux", mission: 'avant-travaux', detail: "une mission avant travaux" },
  { id: 'tab-reception', label: "Réception", mission: 'reception', detail: "une réception provisoire" },
  { id: 'tab-acquisitif', label: "Acquisitif", mission: 'acquisitif', detail: "une mission acquisitive" },
  { id: 'tab-permis', label: "Permis Location", mission: 'permis-location', detail: "un permis de location" },
];

const createMessage = (detail: string) =>
  `Bonjour,\nJe souhaiterais connaître vos disponibilités pour ${detail}, ou bien j’ai une question à ce sujet.`;

const HOURS: string[] = Array.from({ length: 10 }, (_, i) => `${String(10 + i).padStart(2, '0')}:00`);

/* ────────────────────────────────────────────────────────────────────────── */
/* STEPPER                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

const CalculatorStepper: React.FC<{ currentStep: number }> = ({ currentStep }) => (
  <div className="flex items-center justify-center mb-8">
    {CALCULATOR_STEPS.map((step, index) => (
      <React.Fragment key={step.id}>
        <div className="flex flex-col items-center">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
              index <= currentStep ? 'bg-gradient-to-br from-orange-vif to-amber-500 text-white shadow-lg' : 'bg-gray-200 text-slate-500'
            } ${index === currentStep ? 'ring-4 ring-orange-vif/25 scale-105' : ''}`}
          >
            <step.icon className="w-6 h-6" />
          </div>
          <p
            className={`mt-2 text-xs md:text-sm font-semibold transition-colors duration-300 ${
              index <= currentStep ? 'text-orange-vif' : 'text-slate-500'
            }`}
          >
            {step.name}
          </p>
        </div>
        {index < CALCULATOR_STEPS.length - 1 && (
          <div
            className={`flex-1 h-1 mx-2 md:mx-4 rounded-full transition-colors duration-300 ${
              index < currentStep ? 'bg-orange-vif' : 'bg-gray-200'
            }`}
          />
        )}
      </React.Fragment>
    ))}
  </div>
);

/* ────────────────────────────────────────────────────────────────────────── */
/* PRICING (STRICTEMENT basé sur src/constants/index.ts)                      */
/* ────────────────────────────────────────────────────────────────────────── */

const getEntrepotBucket = (surface: number) => {
  if (surface <= 300) return '0';
  const ceil = Math.ceil((surface - 300) / 100) * 100 + 300;
  return String(Math.min(ceil, 2000));
};

const readPriceFromMap = (
  state: CalculatorState
): { base: number; isPerParty: boolean; meta: { baseLabel?: string; chambreExtras?: number; sdbExtras?: number; baseUnit?: number } } => {
  const isPerParty = state.mission === 'locatif';

  if (state.mission === 'locatif') {
    let typeKey: 'appartement' | 'maison' | 'entrepot' = 'appartement';
    if (state.typeBien === 'maison') typeKey = 'maison';
    if ((state.typeBien as any) === 'entrepot' || (state.typeBien as any) === 'commercial') typeKey = 'entrepot';
    if (state.typeBien === 'studio' || state.typeBien === 'kot') typeKey = 'appartement';

    if (typeKey === 'entrepot') {
      const bucket = getEntrepotBucket(state.surface || 0);
      const key = `locatif_entrepot_${bucket}_0`;
      const base = PRICE_MAP[key] ?? 0;
      return { base, isPerParty, meta: { baseLabel: `Base entrepôt ${bucket || 300} m²`, baseUnit: base } };
    }

    const chambres = state.typeBien === 'studio' ? 0 : Math.max(0, state.chambres || 0);
    const sdb = Math.max(1, state.sdb || 1);

    const key =
      typeKey === 'appartement'
        ? `locatif_appartement_${chambres}_${sdb}`
        : `locatif_maison_${Math.max(1, chambres)}_${sdb}`;

    const baseFromMap = PRICE_MAP[key] ?? 0;

    if (state.typeBien === 'studio') {
      const baseUnit = 125;
      const sdbExtras = Math.max(0, sdb - 1) * 20;
      return { base: baseFromMap, isPerParty, meta: { baseLabel: 'Base studio 125€', sdbExtras, baseUnit } };
    }

    const baseUnit = state.typeBien === 'maison' ? 200 : 140;
    const chambreExtras = Math.max(0, (chambres || 1) - 1) * 15;
    const sdbExtras = Math.max(0, sdb - 1) * 20;

    return { base: baseFromMap, isPerParty, meta: { baseLabel: `Base ${state.typeBien === 'maison' ? 'maison' : 'appartement'} ${baseUnit}€`, chambreExtras, sdbExtras, baseUnit } };
  }

  if (state.mission === 'avant-travaux') {
    const fac = Math.min(4, Math.max(1, state.facades || 1));
    const key = `avant-travaux_maison_${fac}f`;
    const base = PRICE_MAP[key] ?? 0;
    return { base, isPerParty: false, meta: { baseLabel: `Maison ${fac} façade(s)`, baseUnit: base } };
  }

  if (state.mission === 'reception') {
    const receptionPrices: Record<string, number> = { studio: 150, appartement: 180, maison: 250, villa: 350 };
    const type = state.typeBien as keyof typeof receptionPrices;
    const baseUnit = receptionPrices[type] || 0;
    const chambreExtras = Math.max(0, (state.chambres || 1) - 1) * 10;
    const sdbExtras = Math.max(0, (state.sdb || 1) - 1) * 20;
    const base = baseUnit + chambreExtras + sdbExtras;
    return { base, isPerParty: false, meta: { baseLabel: `Base ${type} ${baseUnit}€`, chambreExtras, sdbExtras, baseUnit } };
  }

  if (state.mission === 'permis-location') {
    const baseUnit = 248.05;
    const collectifExtras = Math.max(0, (state.chambres_communautaire || 1) - 1) * 49.61;
    const base = baseUnit + collectifExtras;
    return { base, isPerParty: false, meta: { baseLabel: 'Base logement individuel', baseUnit } };
  }

  return { base: 0, isPerParty: false, meta: {} }; // Acquisitif est sur devis
};

const applyModifiers = (base: number, state: CalculatorState): { priced: number; options: { label: string; value: number }[] } => {
  if (!base) return { priced: 0, options: [] };
  let extra = 0;
  const options: { label: string; value: number }[] = [];

  const add = (key: keyof typeof PRICE_MODIFIERS, enabled: boolean, label: string) => {
    if (!enabled) return;
    const mod = PRICE_MODIFIERS[key]?.value ?? 0;
    const inc = mod > 0 && mod < 1 ? base * mod : mod;
    extra += inc;
    options.push({ label, value: Math.round(inc * 100) / 100 });
  };
  
  if(state.mission === 'locatif') {
    add('meuble', !!state.meuble, 'Meublé');
    add('jardin', !!state.jardin, 'Jardin >100m²');
  }

  return { priced: Math.max(0, Math.round((base + extra) * 100) / 100), options };
};

/* ────────────────────────────────────────────────────────────────────────── */
/* FORM                                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

const CalculatorForm: React.FC = () => {
  const [state, setState] = useState<CalculatorState>(initialCalculatorState);

  const [contact, setContact] = useState<CalculatorContact>(() => {
    const detail = TABS[0].detail;
    return {
      propertyAddress: '', fullName: '', email: '', phone: '',
      missionDetail: detail,
      appointmentDate: '',
      message: createMessage(detail),
    };
  });

  const [activeTab, setActiveTab] = useState<string>(TABS[0].id);
  const [chargePar, setChargePar] = useState<'bailleur' | 'preneur'>('bailleur');
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rdvDate, setRdvDate] = useState<string>('');
  const [rdvHeure, setRdvHeure] = useState<string>('');

  const switchTab = (tab: TabDef) => {
    setActiveTab(tab.id);

    const defaultStateForMission: CalculatorState = { ...initialCalculatorState, mission: tab.mission };
    if (tab.mission === 'permis-location') {
      defaultStateForMission.typeBien = 'studio';
      defaultStateForMission.chambres_communautaire = 1;
    }
    if (tab.mission === 'reception') {
      defaultStateForMission.typeBien = 'studio';
    }
     if (tab.mission === 'acquisitif') {
      defaultStateForMission.typeBien = 'appartement';
    }
    setState(defaultStateForMission);

    const newDetail = tab.mission === 'locatif' ? missionDetailOptions.locatif[0] : tab.detail;
    setContact(prev => ({ ...prev, missionDetail: newDetail, message: createMessage(newDetail) }));
  };
  
  const handleLocatifDetailChange = (detail: string) => {
    setContact(prev => ({ ...prev, missionDetail: detail, message: createMessage(detail) }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    const val =
      type === 'checkbox' ? checked
      : ['chambres', 'sdb', 'autres_pieces', 'chambres_communautaire', 'facades', 'surface'].includes(name)
        ? parseInt(value, 10) || 0
        : value;
    setState(prev => ({ ...prev, [name]: val as any }));
  };

  const handleContactChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setContact(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const { base, isPerParty, meta } = readPriceFromMap(state);
  const { priced, options } = applyModifiers(base, state);

  const computePrices = () => {
    if (!priced) return { prixBailleur: 0, prixPreneur: 0, totalCumule: 0 };
    const twoParties = state.frais === '2parties';
    const perParty = isPerParty ? priced : twoParties ? priced / 2 : priced;
    if (isPerParty) {
      const prixBailleur = twoParties ? perParty : (chargePar === 'bailleur' ? perParty * 2 : 0);
      const prixPreneur = twoParties ? perParty : (chargePar === 'preneur' ? perParty * 2 : 0);
      return { prixBailleur, prixPreneur, totalCumule: prixBailleur + prixPreneur };
    }
    return { prixBailleur: 0, prixPreneur: 0, totalCumule: priced };
  };

  const { prixBailleur, prixPreneur, totalCumule } = computePrices();

  const getBreakdown = () => {
    const lines: { label: string; value?: number; hint?: string }[] = [];
    if (priced <= 0 && state.mission !== 'acquisitif') return [];

    switch (state.mission) {
      case 'locatif':
        if (meta.baseLabel && meta.baseUnit !== undefined) lines.push({ label: meta.baseLabel, value: meta.baseUnit });
        if (state.typeBien !== 'studio') {
          const extraCh = Math.max(0, (state.chambres || 1) - 1);
          if (extraCh > 0) lines.push({ label: `Chambres suppl.: ${extraCh} × 15€`, value: extraCh * 15 });
        }
        const extraSdb = Math.max(0, (state.sdb || 1) - 1);
        if (extraSdb > 0) lines.push({ label: `Salles d'eau suppl.: ${extraSdb} × 20€`, value: extraSdb * 20 });
        options.forEach(opt => lines.push({ label: `Option — ${opt.label}`, value: opt.value }));
        if (priced > base && isPerParty) lines.push({ label: 'Montant par partie', value: priced });
        break;

      case 'avant-travaux':
        if (meta.baseLabel && meta.baseUnit !== undefined) lines.push({ label: meta.baseLabel, value: meta.baseUnit });
        break;

      case 'reception':
        if (meta.baseLabel && meta.baseUnit !== undefined) lines.push({ label: meta.baseLabel, value: meta.baseUnit });
        const ch = Math.max(0, (state.chambres || 1) - 1);
        if (ch > 0) lines.push({ label: `Chambres suppl.: ${ch} × 10€`, value: ch * 10 });
        const sdbRec = Math.max(0, (state.sdb || 1) - 1);
        if (sdbRec > 0) lines.push({ label: `Salles d'eau suppl.: ${sdbRec} × 20€`, value: sdbRec * 20 });
        break;

      case 'permis-location':
        lines.push({ label: 'Base (logement individuel)', value: 248.05 });
        const extraRooms = Math.max(0, (state.chambres_communautaire || 1) - 1);
        if (extraRooms > 0) lines.push({ label: `Pièces suppl. (collectif): ${extraRooms} × 49.61€`, value: extraRooms * 49.61 });
        break;
        
      case 'acquisitif':
        break;
    }
    return lines;
  };

  const breakdown = getBreakdown();

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const subject = `Demande d'informations via Calculateur - ${contact.missionDetail}`;

    // --- BLOC 1: DÉTAILS DE LA SÉLECTION ---
    let stateDetails = '';
    switch (state.mission) {
      case 'locatif':
        stateDetails = `
          Type de bien: ${state.typeBien}
          Chambres: ${state.chambres}
          Salles de bain: ${state.sdb}
          Options:
            - Meublé: ${state.meuble ? 'Oui' : 'Non'}
            - Jardin >100m²: ${state.jardin ? 'Oui' : 'Non'}
          Frais à charge: ${state.frais === '2parties' ? 'Deux parties' : `Une seule partie (${chargePar})`}
        `;
        break;
      case 'avant-travaux':
        stateDetails = `
          Type de bien: Maison
          Nombre de façades: ${state.facades}
        `;
        break;
      case 'reception':
        stateDetails = `
          Type de bien: ${state.typeBien}
          Chambres: ${state.chambres}
          Salles de bain: ${state.sdb}
        `;
        break;
      case 'permis-location':
        stateDetails = `
          Type de logement: ${state.chambres_communautaire > 1 ? `Collectif (${state.chambres_communautaire} pièces)`: 'Individuel'}
        `;
        break;
      case 'acquisitif':
        stateDetails = `
          Type de bien à évaluer: ${state.typeBien}
        `;
        break;
      default:
        stateDetails = "Aucun détail de configuration disponible.";
    }

    // --- BLOC 2: PRIX ---
    const prixBlock =
      priced === 0
        ? `Prix estimé: Sur devis\n`
        : isPerParty
        ? `Prix bailleur: ${prixBailleur.toFixed(2)} €\nPrix preneur: ${prixPreneur.toFixed(2)} €\nTotal estimé: ${totalCumule.toFixed(2)} €\n`
        : `Total estimé: ${totalCumule.toFixed(2)} €\n`;

    const detailsText =
      breakdown.length
        ? 'Détail du calcul:\n' +
          breakdown.map(l => `- ${l.label}${typeof l.value === 'number' ? ` = ${l.value.toFixed(2)} €` : ''}`).join('\n')
        : '';
        
    // --- ASSEMBLAGE DU MESSAGE FINAL ---
    const message = `
      ===============================================
      NOUVELLE DEMANDE DE RENDEZ-VOUS
      ===============================================

      INFORMATIONS PERSONNELLES
      -----------------------------------------------
      Nom et prénom: ${contact.fullName}
      Email: ${contact.email}
      Téléphone: ${contact.phone || 'Non fourni'}
      Adresse du bien: ${contact.propertyAddress}
      
      RENDEZ-VOUS SOUHAITÉ
      -----------------------------------------------
      Date: ${rdvDate}
      Heure: ${rdvHeure}

      DÉTAILS DE LA MISSION
      -----------------------------------------------
      Mission: ${contact.missionDetail}
      ${stateDetails.trim()}

      ESTIMATION DU PRIX
      -----------------------------------------------
      ${prixBlock.trim()}
      ${detailsText ? `\n${detailsText}` : ''}
      
      MESSAGE DU CLIENT
      -----------------------------------------------
      ${contact.message}
      
      NOTE ADMINISTRATIVE
      -----------------------------------------------
      - Pour la bonne tenue de la mission, il sera demandé de préparer le contrat de bail.
      - Pour toute mission hors horaires, le client a été invité à le préciser dans son message.
    `.replace(/^      /gm, ''); // Supprime l'indentation pour un mail propre

    try {
      await sendMail({
        type: 'calculator',
        name: contact.fullName,
        email: contact.email,
        phone: contact.phone,
        message,
        subject,
        page: 'calculator',
        source: 'site',
        appointment: `${rdvDate} ${rdvHeure}`.trim(),
      });

      reportConversion(FORM_CONVERSION_LABEL);
      alert('Demande envoyée avec succès.');
      
      setCurrentStep(0); // Optionnel: revenir à la première étape après l'envoi
      const detail = TABS.find(t => t.id === activeTab)?.detail || TABS[0].detail;
      setContact({
        propertyAddress: '', fullName: '', email: '', phone: '',
        missionDetail: detail,
        appointmentDate: '',
        message: createMessage(detail),
      });
      setRdvDate('');
      setRdvHeure('');

    } catch (error) {
      alert(error instanceof Error ? error.message : "Erreur lors de l'envoi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, CALCULATOR_STEPS.length - 1));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 0));

  const TabButton: React.FC<{ tab: TabDef; active: boolean; onClick: () => void; }> = ({ tab, active, onClick }) => (
    <button type="button" onClick={onClick} className={`w-full py-3 px-2 text-center font-semibold rounded-lg transition-all duration-300 text-xs md:text-sm border ${ active ? 'bg-gradient-to-r from-orange-vif to-amber-500 text-white shadow-md border-transparent' : 'bg-white hover:bg-orange-vif/10 text-blue-deep border-slate-200' }`}>
      {tab.label}
    </button>
  );

  /* ──────────────────────────────────────────────────────────────────────── */
  /* ETAPE 2 : CONTACT                                                       */
  /* ──────────────────────────────────────────────────────────────────────── */
  if (currentStep === 1) {
    return (
      <div className="bg-blue-deep/5 rounded-2xl p-4 md:p-6 max-w-5xl mx-auto shadow-lg border border-orange-vif/20">
        <CalculatorStepper currentStep={currentStep} />

        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-inner border border-slate-100">
          <h4 className="text-2xl font-extrabold text-blue-deep mb-6 text-center tracking-tight">
            Prendre rendez-vous
          </h4>

          <div className="mb-6 p-4 rounded-xl text-sm text-slate-700 border border-slate-200 bg-gradient-to-br from-slate-50 to-white">
            <div className="grid md:grid-cols-2 gap-3">
              <p><strong>Type de mission :</strong> {contact.missionDetail}</p>
              <p><strong>Type de bien :</strong> {state.typeBien}</p>
              
              {priced === 0 ? (
                <p className="md:col-span-2"><strong>Prix :</strong> Sur devis</p>
              ) : isPerParty ? (
                <>
                  <p><strong>Prix bailleur :</strong> {prixBailleur.toFixed(2)} €</p>
                  <p><strong>Prix preneur :</strong> {prixPreneur.toFixed(2)} €</p>
                  <p className="md:col-span-2"><strong>Total :</strong> {totalCumule.toFixed(2)} €</p>
                </>
              ) : (
                <p className="md:col-span-2"><strong>Total :</strong> {totalCumule.toFixed(2)} €</p>
              )}
            </div>

            {breakdown.length > 0 && (
              <div className="mt-3">
                <p className="font-semibold mb-1">Détail du calcul</p>
                <ul className="text-xs text-slate-600 space-y-1">
                  {breakdown.map((l, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{l.label}</span>
                      {typeof l.value === 'number' && <span className="font-medium">{l.value.toFixed(2)} €</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <form onSubmit={handleContactSubmit} className="space-y-4 max-w-xl mx-auto">
            <input
              type="text"
              name="propertyAddress"
              placeholder="Adresse du bien"
              value={contact.propertyAddress}
              onChange={handleContactChange}
              className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50"
              required
            />

            <div className="grid sm:grid-cols-2 gap-4">
              <input
                type="date"
                value={rdvDate}
                onChange={(e) => setRdvDate(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50"
                required
              />
              <select
                value={rdvHeure}
                onChange={(e) => setRdvHeure(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50"
                required
              >
                <option value="" disabled>Heure souhaitée</option>
                {HOURS.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Pour toute mission hors horaires, merci de nous communiquer dans votre mail l’heure voulue.
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <input
                type="text"
                name="fullName"
                placeholder="Nom et prénom"
                value={contact.fullName}
                onChange={handleContactChange}
                className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50"
                required
              />
              <input
                type="tel"
                name="phone"
                placeholder="Numéro de téléphone"
                value={contact.phone}
                onChange={handleContactChange}
                className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50"
              />
            </div>

            <input
              type="email"
              name="email"
              placeholder="Adresse e-mail"
              value={contact.email}
              onChange={handleContactChange}
              className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50"
              required
            />

            <textarea
              name="message"
              value={contact.message}
              onChange={handleContactChange}
              rows={4}
              className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50"
            />

            <div className="rounded-lg border border-orange-vif/30 bg-orange-50 p-3 text-xs text-orange-900">
              Note : pour la bonne tenue de la mission, il vous sera également demandé de préparer votre contrat de bail.
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full px-4 py-3 bg-gradient-to-r from-orange-vif to-amber-500 text-white rounded-lg font-semibold shadow-md hover:shadow-lg transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Envoi en cours...' : 'Envoyer ma demande'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={prevStep}
              className="text-blue-deep underline underline-offset-4 hover:text-orange-vif transition"
            >
              Retour
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ──────────────────────────────────────────────────────────────────────── */
  /* ETAPE 1 : ESTIMATION                                                     */
  /* ──────────────────────────────────────────────────────────────────────── */
  return (
    <div className="bg-blue-deep/5 rounded-2xl p-4 md:p-6 max-w-5xl mx-auto shadow-lg border border-orange-vif/20">
      <CalculatorStepper currentStep={currentStep} />
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 md:gap-3 mb-2">
        {TABS.map(tab => <TabButton key={tab.id} tab={tab} active={activeTab === tab.id} onClick={() => switchTab(tab)} />)}
      </div>

      <div className="bg-white p-6 md:p-8 rounded-b-2xl shadow-inner border border-slate-100">
        <div className="grid md:grid-cols-2 gap-8 items-start">
          {/* COL GAUCHE : FORM */}
          <div className="space-y-6">

            {/* FORMULAIRE: LOCATIF */}
            {state.mission === 'locatif' && (
              <>
                <div>
                  <label className="block font-semibold text-slate-700 mb-2">Type de mission locative</label>
                  <div className="grid grid-cols-2 gap-3">
                    {missionDetailOptions.locatif.map(detail => (
                      <button key={detail} type="button" onClick={() => handleLocatifDetailChange(detail)} className={`w-full py-2 px-3 text-center font-semibold rounded-lg transition-all duration-300 text-sm border ${ contact.missionDetail === detail ? 'bg-orange-vif text-white shadow-md border-transparent' : 'bg-white hover:bg-orange-vif/10 text-blue-deep border-slate-200' }`}>
                        {detail.includes("d'entrée") ? "Entrée" : "Sortie"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Type de bien</label>
                    <select name="typeBien" onChange={handleChange} value={state.typeBien} className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50">
                      <option value="appartement">Appartement</option>
                      <option value="maison">Maison / Villa</option>
                      <option value="studio">Studio</option>
                      <option value="kot">Kot (logement étudiant)</option>
                    </select>
                  </div>
                  {(state.typeBien === 'appartement' || state.typeBien === 'maison' || state.typeBien === 'kot') && (
                    <>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Chambres</label>
                        <select name="chambres" onChange={handleChange} value={state.chambres} className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50">
                          {Array.from({ length: 10 }, (_, i) => i + 1).map(i => <option key={i} value={i}>{`${i} chambre${i > 1 ? 's' : ''}`}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Salles de bain</label>
                        <select name="sdb" onChange={handleChange} value={state.sdb} className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50">
                          {Array.from({ length: 6 }, (_, i) => i + 1).map(i => <option key={i} value={i}>{`${i} salle${i > 1 ? 's' : ''} de bain`}</option>)}
                        </select>
                      </div>
                    </>
                  )}
                  {state.typeBien === 'studio' && (
                     <div>
                        <label className="block font-semibold text-slate-700 mb-1">Salles de bain</label>
                        <select name="sdb" onChange={handleChange} value={state.sdb} className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50">
                          {Array.from({ length: 6 }, (_, i) => i + 1).map(i => <option key={i} value={i}>{`${i} salle${i > 1 ? 's' : ''} de bain`}</option>)}
                        </select>
                      </div>
                  )}
                </div>
                <div>
                  <p className="font-semibold text-slate-700 mb-2">Options</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <label className="inline-flex items-center">
                      <input type="checkbox" name="meuble" checked={state.meuble} onChange={handleChange} className="h-5 w-5 text-orange-vif rounded focus:ring-orange-vif/50"/>
                      <span className="ml-2">Bien meublé</span>
                    </label>
                    <label className="inline-flex items-center">
                      <input type="checkbox" name="jardin" checked={state.jardin} onChange={handleChange} className="h-5 w-5 text-orange-vif rounded focus:ring-orange-vif/50"/>
                      <span className="ml-2">Jardin &gt;100m²</span>
                    </label>
                  </div>
                </div>
              </>
            )}

            {/* FORMULAIRE: AVANT TRAVAUX */}
            {state.mission === 'avant-travaux' && (
              <div className="space-y-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Type de bien</label>
                  <select name="typeBien" onChange={handleChange} value={state.typeBien} className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50" disabled>
                    <option value="maison">Maison</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nombre de façades</label>
                  <select name="facades" onChange={handleChange} value={state.facades} className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50">
                    {[1, 2, 3, 4].map(i => <option key={i} value={i}>{`${i} façade${i > 1 ? 's' : ''}`}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* FORMULAIRE: RECEPTION */}
            {state.mission === 'reception' && (
              <div className="space-y-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Type de bien</label>
                  <select name="typeBien" onChange={handleChange} value={state.typeBien} className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50">
                    <option value="studio">Studio</option>
                    <option value="appartement">Appartement</option>
                    <option value="maison">Maison</option>
                    <option value="villa">Villa</option>
                  </select>
                </div>
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Chambres</label>
                    <select name="chambres" onChange={handleChange} value={state.chambres} className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50">
                      {Array.from({ length: 10 }, (_, i) => i + 1).map(i => <option key={i} value={i}>{`${i} chambre${i > 1 ? 's' : ''}`}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Salles de bain</label>
                    <select name="sdb" onChange={handleChange} value={state.sdb} className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50">
                      {Array.from({ length: 6 }, (_, i) => i + 1).map(i => <option key={i} value={i}>{`${i} salle${i > 1 ? 's' : ''} de bain`}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* FORMULAIRE: PERMIS LOCATION */}
            {state.mission === 'permis-location' && (
              <div className="space-y-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Type de logement</label>
                   <select name="chambres_communautaire" value={state.chambres_communautaire} onChange={handleChange} className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50">
                     <option value={1}>Logement individuel</option>
                     <option value={2}>Logement collectif (2 pièces)</option>
                     <option value={3}>Logement collectif (3 pièces)</option>
                     <option value={4}>Logement collectif (4 pièces)</option>
                     <option value={5}>Logement collectif (5 pièces)</option>
                   </select>
                  <p className="text-xs text-slate-500 mt-1">Indiquez s'il s'agit d'un logement pour une personne/famille ou d'un logement collectif (kots...).</p>
                </div>
                <p className="text-sm text-slate-600 p-3 bg-slate-50 rounded-lg border">Les tarifs sont basés sur les montants fixés pour la Wallonie en 2025.</p>
              </div>
            )}
            
            {/* FORMULAIRE: ACQUISITIF (SUR DEVIS) */}
            {state.mission === 'acquisitif' && (
              <div className="space-y-4">
                <p className="text-lg font-semibold text-slate-800">Mission sur devis</p>
                <p className="text-sm text-slate-600">Pour une mission acquisitive (évaluation), veuillez nous fournir quelques détails sur le bien pour un devis personnalisé.</p>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Type de bien à évaluer</label>
                  <select name="typeBien" onChange={handleChange} value={state.typeBien} className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50">
                    <option value="appartement">Appartement</option>
                    <option value="maison">Maison / Villa</option>
                    <option value="terrain">Terrain</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
              </div>
            )}
            
            {isPerParty && (
              <div className="space-y-3 pt-4 border-t">
                <label className="block font-semibold text-slate-700">Frais à charge</label>
                <select name="frais" onChange={handleChange} value={state.frais} className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-vif/50">
                  <option value="2parties">Deux parties</option>
                  <option value="1seulepartie">Une seule partie</option>
                </select>

                {state.frais === '1seulepartie' && (
                  <div className="flex items-center gap-6 pl-1">
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" name="charge_par" checked={chargePar === 'bailleur'} onChange={() => setChargePar('bailleur')} className="h-4 w-4 text-orange-vif"/>
                      <span>Bailleur</span>
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" name="charge_par" checked={chargePar === 'preneur'} onChange={() => setChargePar('preneur')} className="h-4 w-4 text-orange-vif"/>
                      <span>Preneur</span>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* COL DROITE : RECAP */}
          <div className="bg-gradient-to-br from-slate-50 to-white p-6 rounded-2xl shadow-inner mt-6 md:mt-0 border border-slate-200 md:sticky md:top-24">
            <h4 className="text-xl font-bold text-blue-deep mb-4 text-center">Récapitulatif</h4>
            <div className="space-y-2 text-sm text-slate-700">
              <p><strong>Mission :</strong> {contact.missionDetail}</p>
              { (state.mission !== 'permis-location') && <p><strong>Bien :</strong> {state.typeBien}</p> }

              {priced === 0 ? (
                <div className="text-center py-4"><p className="font-bold text-lg text-blue-deep">Sur devis</p></div>
              ) : isPerParty ? (
                <>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="text-center p-2 border rounded-lg"><p className="font-semibold">Bailleur</p><p className="text-lg font-bold text-orange-vif">{prixBailleur.toFixed(2)} €</p></div>
                    <div className="text-center p-2 border rounded-lg"><p className="font-semibold">Preneur</p><p className="text-lg font-bold text-orange-vif">{prixPreneur.toFixed(2)} €</p></div>
                  </div>
                  <div className="text-center pt-2 mt-2 border-t"><p className="font-semibold">Total</p><p className="text-xl font-extrabold text-blue-deep">{totalCumule.toFixed(2)} €</p></div>
                </>
              ) : (
                <div className="text-center pt-2 mt-2 border-t"><p className="font-semibold">Total</p><p className="text-xl font-extrabold text-blue-deep">{totalCumule.toFixed(2)} €</p></div>
              )}
            </div>

            {breakdown.length > 0 && (
              <div className="mt-4 pt-3 border-t">
                <p className="font-semibold mb-2 text-center">Détail du calcul</p>
                <ul className="text-xs text-slate-600 space-y-1">
                  {breakdown.map((l, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{l.label}</span>
                      {typeof l.value === 'number' && <span className="font-medium">{l.value.toFixed(2)} €</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">Cette estimation est indicative. Un devis définitif sera fourni après analyse de votre demande.</p>
        <div className="mt-8 text-center"><button type="button" onClick={nextStep} className="px-5 py-3 bg-gradient-to-r from-orange-vif to-amber-500 text-white rounded-lg font-semibold shadow-md hover:shadow-lg transition active:scale-[0.99]">Demander un rendez-vous</button></div>
      </div>
    </div>
  );
};


/* ────────────────────────────────────────────────────────────────────────── */
/* WRAPPER                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */
const Calculator: React.FC = () => {
  const [ref, isVisible] = useIntersectionObserver();

  return (
    <section id="Calculator" ref={ref as React.RefObject<HTMLElement>} className={`bg-white py-12 md:py-20 px-6 transition-all duration-1000 ease-out scroll-mt-24 ${ isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10' }`}>
      <div className="container mx-auto">
        <CalculatorForm />
      </div>
    </section>
  );
};

export default Calculator;