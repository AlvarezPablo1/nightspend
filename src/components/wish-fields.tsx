import type { wishItems } from "@/db/schema";
import { moneyInput } from "@/lib/format";
import { AmountField, Field } from "./forms";

export function WishFields({
  projects,
  item,
}: {
  projects: { id: number; name: string }[];
  item?: typeof wishItems.$inferSelect;
}) {
  return (
    <>
      {item && <input type="hidden" name="id" value={item.id} />}
      <Field label="Qué querés comprar">
        <input name="name" required defaultValue={item?.name} autoComplete="off" className="input" />
      </Field>
      <AmountField
        name="estimatedPrice"
        label="Precio estimado"
        required={false}
        defaultValue={moneyInput(item?.estimatedPrice)}
        defaultCurrency={item?.currency}
      />
      <Field label="Ya ahorrado">
        <input name="saved" inputMode="decimal" defaultValue={moneyInput(item?.saved || null)} placeholder="0" className="input num" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Proyecto">
          <select name="projectId" defaultValue={item?.projectId ?? ""} className="input">
            <option value="">Sin proyecto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prioridad">
          <select name="priority" defaultValue={item?.priority ?? "media"} className="input">
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </Field>
      </div>
      <Field label="Link (opcional)">
        <input name="link" type="url" defaultValue={item?.link ?? ""} autoComplete="off" placeholder="https://" className="input" />
      </Field>
      <Field label="Notas (opcional)">
        <textarea name="note" rows={2} defaultValue={item?.note ?? ""} className="input" />
      </Field>
    </>
  );
}
