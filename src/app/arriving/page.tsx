import { currentUser } from "@/lib/auth";
import { category, LOCALITIES } from "@/lib/catalog";
import { addDays, todayIST } from "@/lib/pricing";
import { arrivalAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";

export const metadata = { title: "Set up my room", description: "Moving to Bengaluru? Get a whole room set up within days from verified sellers nearby." };

const WANTS = ["bed", "mattress", "study_table", "chair", "office_chair", "fan", "cooler", "induction", "kitchen_set", "bucket_set", "fridge", "washing_machine", "sofa", "cycle"];
const DEFAULT_WANTS = ["mattress", "study_table", "chair", "fan"];

export default async function Arriving() {
  const user = await currentUser();
  const a = user?.arrival;
  const today = todayIST();
  return (
    <div className="container-page max-w-3xl py-10">
      <p className="chip bg-arrive-soft text-arrive">For newcomers</p>
      <h1 className="mt-3 text-4xl font-extrabold leading-tight">Set up my room this week.</h1>
      <p className="mt-3 text-lg text-ink-soft">
        A fresher joining in July needs a mattress, table, chair, bucket, fan and induction stove within days. The people leaving in June own exactly those things.
      </p>
      <ActionForm action={arrivalAction} className="card mt-8 space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="moveInDate">Move-in date</label>
            <input id="moveInDate" type="date" name="moveInDate" required min={today} defaultValue={a?.moveInDate ?? addDays(today, 7)} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="locality">Area</label>
            <select id="locality" name="locality" required defaultValue={a?.locality ?? ""} className="input">
              <option value="" disabled>Where are you moving?</option>
              {LOCALITIES.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="budget">Budget (₹)</label>
            <input id="budget" type="number" name="budget" min={0} step={500} defaultValue={a?.budget ?? 15000} className="input" />
          </div>
        </div>
        <fieldset>
          <legend className="label">What do you need? We&apos;ll alert you when these get listed nearby.</legend>
          <div className="flex flex-wrap gap-2">
            {WANTS.map((id) => {
              const c = category(id);
              return (
                <label key={id} className="cursor-pointer">
                  <input type="checkbox" name="wants" value={id} defaultChecked={a ? a.wants.includes(id) : DEFAULT_WANTS.includes(id)} className="peer sr-only" />
                  <span className="inline-block rounded-full border border-line bg-white px-3 py-1.5 text-sm peer-checked:border-arrive peer-checked:bg-arrive-soft peer-checked:text-arrive peer-focus-visible:ring-2 peer-focus-visible:ring-tape">
                    {c.icon} {c.label}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {!user && <p className="text-xs text-ink-soft">Log in later to save this and get WhatsApp move-in alerts.</p>}
        <Submit className="btn-arrive w-full sm:w-auto" pendingText="Finding items…">Show my Starter Kits →</Submit>
      </ActionForm>
    </div>
  );
}
