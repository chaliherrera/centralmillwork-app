// Términos y Condiciones de Central Millwork (texto provisto por Chali, Word 04/11/2025).
// Se muestra en el portal del cliente (modal "View terms") antes de ver el plan propuesto.

export const TERMS_VERSION = '04/11/2025'

const SECTIONS: Array<{ h?: string; body: string }> = [
  { body: 'Central Millwork, LLC. (CM) is not bound by any terms or conditions in documents or flow-through provisions unless shared with CM before contract execution, purchase order issuance, estimate signing, or any document granting CM the authority for the agreed-upon scope.' },
  { h: 'Payment Conditions', body: '50% deposit is required, complemented by net-30 monthly progress payments for materials acquired, stored, or fabricated. 50% deposit is also required for substantial change orders. Payment delays will necessitate schedule adjustments for scheduling, delivery, and installation, without imposing additional charges on CM.' },
  { h: 'Scope of Work', body: 'The scope solely comprises what is outlined in this estimate and the sanctioned shop drawings. CM has reviewed the Construction documents purely for reference, as they don’t form part of the designated scope of work.' },
  { h: 'Scope Changes', body: 'Altered scope entitles CM to compensation for costs, overhead, and profit.' },
  { h: 'Back Charges and LD', body: 'Client’s efforts to impose back charges, withhold payment, or make payment claims against CM are valid only if CM fails to address issues within 5 days of receiving written notice. The Client cannot seize CM’s tools, equipment, or unpaid materials. The Client can’t demand liquidated or actual damages for delays, and any such claim can’t exceed the specified amount (NONE) in these terms. Furthermore, liquidated damages can’t surpass the contract or PO amount for this project or monies already paid.' },
  { h: 'Code Compliance', body: 'Our role primarily focuses on other aspects of the project and relies on others to oversee and ensure adherence to all relevant code requirements.' },
  { h: 'Other Fees and costs', body: 'CM is relieved from any obligation to pay permit fees, as well as unforeseen regulatory requirement fees or potential expenses. CM is entitled to compensation for expenses, including costs that may not have been factored into the initial estimate due to their unpredictable nature. These expenses encompass material escalation costs arising from extended project delays (spanning over 12 months from the date of this estimate), despite having received a deposit.' },
  { h: 'Millwork Installation (if included)', body: 'CM refrains from installing millwork in non-fully enclosed buildings and/or spaces lacking permanent conditioning unless a signed warranty void is provided. Proper site preparation is essential, with additional expenses for extra or sequenced trips reimbursed to CM through a change order process, including site verification trips (one), unless specifically noted in the estimate, PO, and/or contract. CM will protect the installed material to the best of our ability but is not liable for damage caused by others.' },
  { h: 'Schedule', body: 'CM is not accountable for delays or defaults caused by external factors or acts of nature. Despite any opposing provision, CM is entitled to an equitable adjustment in the Subcontract sum to cover proven additional expenses resulting from unforeseen delays or disruptions in the execution or sequencing of CM’s work due to reasons beyond their control, or from the collective impact of changes sanctioned by the Client. Partial delays in specific project components can lead to disruptions in the fabrication and installation process. These disruptions may negatively affect other parts of the project, resulting in an overall project delay. CM has the right to request a fair adjustment to the contract sum to account for this, as well as adjustments to scheduling timelines.\n\nThe Client must provide a written schedule encompassing all trades and notify CM in writing of any reasonable changes, allowing CM to adjust its production schedule, delivery, and installation.\n\nInsufficient direction, Specifications, and engineering details, along with shop drawing reviews delays and RFIs, will result in schedule adjustments for delivery, and installation at no extra charges will be imposed to CM due to these adjustments.' },
  { h: 'Marketing', body: 'CM is authorized to place promotional material on the project site for the entire project duration.' },
  { h: 'Verify in field', body: 'Dimensions is a critical requirement for Central Millwork to proceed with the project into production. Submitting projects piecemeal incurs additional effort and may be subject to a change order. To take the VIF, the client must ensure that a drywall is installed on both faces of the wall to receive the work.' },
  { h: 'Caveat', body: 'Due to ongoing volatility in tariffs, import duties, and global supply chain conditions, all pricing is subject to change—even in the presence of a signed contract. Pricing will remain valid only if a material deposit equal to 50% of the total contract value is paid upfront. Without this deposit, we reserve the right to adjust pricing to reflect increased material costs. Any changes will be communicated in writing and require mutual acknowledgment before proceeding.' },
]

export default function TermsContent() {
  return (
    <div className="text-[13px] text-stone-700 leading-relaxed space-y-3">
      <div className="text-stone-400 text-[11px] uppercase tracking-wider font-medium">Version {TERMS_VERSION}</div>
      {SECTIONS.map((s, i) => (
        <div key={i}>
          {s.h && <div className="font-semibold text-stone-900">{s.h}</div>}
          {s.body.split('\n\n').map((p, j) => <p key={j} className={j > 0 ? 'mt-2' : ''}>{p}</p>)}
        </div>
      ))}
      <div className="pt-2 border-t border-stone-200 text-[12px] text-stone-500">
        2939 Blystone Ln. Dallas, TX 75220 &middot; (972) 925-0236 &middot; info@centralmillwork.com &middot; centralmillwork.com
      </div>
    </div>
  )
}
