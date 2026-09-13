"use client";

import { useState } from "react";
import { CoatType, PetSex, Species } from "@prisma/client";
import ServicePicker, { type ServiceOption } from "@/components/ServicePicker";

/**
 * Who the appointment is for. Staff booking at the counter are often looking
 * at a customer who has never been in, so registering the owner and the pet is
 * part of the booking, not a separate errand beforehand.
 */

export interface CustomerOption {
  id: string;
  name: string;
}

export interface PetOption {
  id: string;
  name: string;
  customerId: string;
  species: Species;
}

const fieldClass =
  "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 bg-white";

const SEX_LABEL: Record<PetSex, string> = {
  MALE: "Male",
  FEMALE: "Female",
  UNKNOWN: "Not recorded",
};

const SPECIES_LABEL: Record<Species, string> = {
  DOG: "Dog",
  CAT: "Cat",
  OTHER: "Other",
};

const COAT_LABEL: Record<CoatType, string> = {
  SHORT: "Short",
  MEDIUM: "Medium",
  LONG: "Long",
  DOUBLE: "Double",
  CURLY: "Curly",
  WIRE: "Wire",
  HAIRLESS: "Hairless",
};

function PetFields({
  heading,
  species,
  onSpeciesChange,
}: {
  heading: string;
  species: Species;
  onSpeciesChange: (species: Species) => void;
}) {
  return (
    <div className="border border-stone-200 rounded-lg p-3 space-y-3 bg-stone-50">
      <p className="text-xs font-bold text-stone-500 tracking-tight">{heading}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="block text-stone-600 mb-1">
            Pet name <span className="text-red-700">*</span>
          </span>
          <input name="newPetName" className={fieldClass} />
        </label>
        <label className="text-sm">
          <span className="block text-stone-600 mb-1">Species</span>
          <select
            name="newPetSpecies"
            value={species}
            onChange={(event) => onSpeciesChange(event.target.value as Species)}
            className={fieldClass}
          >
            {Object.values(Species).map((option) => (
              <option key={option} value={option}>
                {SPECIES_LABEL[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-stone-600 mb-1">Sex</span>
          <select name="newPetSex" defaultValue={PetSex.UNKNOWN} className={fieldClass}>
            {Object.values(PetSex).map((option) => (
              <option key={option} value={option}>
                {SEX_LABEL[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-stone-600 mb-1">Breed</span>
          <input name="newPetBreed" className={fieldClass} />
        </label>
        <label className="text-sm">
          <span className="block text-stone-600 mb-1">Weight (lbs)</span>
          <input name="newPetWeightLbs" inputMode="decimal" className={fieldClass} />
        </label>
        <label className="text-sm">
          <span className="block text-stone-600 mb-1">Coat</span>
          <select name="newPetCoatType" defaultValue="" className={fieldClass}>
            <option value="">Not recorded</option>
            {Object.values(CoatType).map((coat) => (
              <option key={coat} value={coat}>
                {COAT_LABEL[coat]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-stone-600 mb-1">Grooming notes</span>
          <input name="newPetGroomingNotes" className={fieldClass} />
        </label>
      </div>
    </div>
  );
}

export default function CustomerPetFields({
  customers,
  pets,
  services,
  defaultCustomerId = "",
  defaultPetId = "",
}: {
  customers: CustomerOption[];
  pets: PetOption[];
  services: ServiceOption[];
  defaultCustomerId?: string;
  defaultPetId?: string;
}) {
  const [mode, setMode] = useState<"existing" | "new">(
    customers.length === 0 ? "new" : "existing"
  );
  const [customerId, setCustomerId] = useState(defaultCustomerId);
  const [petId, setPetId] = useState(defaultPetId);
  const [newPetSpecies, setNewPetSpecies] = useState<Species>(Species.DOG);

  const customerPets = pets.filter((pet) => pet.customerId === customerId);
  const newPet = mode === "new" || petId === "__new__";

  // Only offer services that apply to the pet being booked: a cat groom is not
  // on the menu for a dog. Services with no species apply to everything.
  const species = newPet ? newPetSpecies : customerPets.find((pet) => pet.id === petId)?.species;
  const applicable = species
    ? services.filter((service) => !service.speciesOnly || service.speciesOnly === species)
    : services;

  return (
    <div className="space-y-3">
      {/* Who is this for */}
      <div className="flex flex-wrap gap-3">
        {[
          { value: "existing" as const, label: "Existing customer" },
          { value: "new" as const, label: "New customer" },
        ].map((option) => (
          <label
            key={option.value}
            className={`flex-1 min-w-[10rem] border rounded-lg px-3 py-2 cursor-pointer text-sm font-semibold transition-colors ${
              mode === option.value
                ? "border-amber-500 bg-amber-50 text-stone-900"
                : "border-stone-200 text-stone-600 hover:border-stone-300"
            }`}
          >
            <input
              type="radio"
              name="customerMode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => setMode(option.value)}
              className="accent-amber-700 mr-2"
            />
            {option.label}
          </label>
        ))}
      </div>

      {mode === "existing" ? (
        <>
          <label className="block text-sm">
            <span className="block font-semibold text-stone-700 mb-1.5">
              Customer <span className="text-red-700">*</span>
            </span>
            <select
              name="customerId"
              required
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value);
                setPetId("");
              }}
              className={fieldClass}
            >
              <option value="" disabled>
                Select a customer…
              </option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="block font-semibold text-stone-700 mb-1.5">
              Pet <span className="text-red-700">*</span>
            </span>
            <select
              name="petId"
              required
              value={petId}
              onChange={(event) => setPetId(event.target.value)}
              disabled={!customerId}
              className={`${fieldClass} disabled:bg-stone-100 disabled:text-stone-400`}
            >
              <option value="" disabled>
                {customerId ? "Select a pet…" : "Pick a customer first"}
              </option>
              {customerPets.map((pet) => (
                <option key={pet.id} value={pet.id}>
                  {pet.name}
                </option>
              ))}
              <option value="__new__">+ New pet for this customer…</option>
            </select>
            {customerId && customerPets.length === 0 && (
              <span className="block text-xs text-amber-700 mt-1">
                No pets on file yet — choose &ldquo;New pet&rdquo; to add one now.
              </span>
            )}
          </label>

          {petId === "__new__" && (
            <PetFields
              heading="New pet"
              species={newPetSpecies}
              onSpeciesChange={setNewPetSpecies}
            />
          )}
        </>
      ) : (
        <>
          <div className="border border-stone-200 rounded-lg p-3 space-y-3 bg-stone-50">
            <p className="text-xs font-bold text-stone-500 tracking-tight">
              New customer
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-stone-600 mb-1">
                  First name <span className="text-red-700">*</span>
                </span>
                <input name="newCustomerFirstName" className={fieldClass} />
              </label>
              <label className="text-sm">
                <span className="block text-stone-600 mb-1">
                  Last name <span className="text-red-700">*</span>
                </span>
                <input name="newCustomerLastName" className={fieldClass} />
              </label>
              <label className="text-sm">
                <span className="block text-stone-600 mb-1">
                  Email <span className="text-red-700">*</span>
                </span>
                <input name="newCustomerEmail" type="email" className={fieldClass} />
              </label>
              <label className="text-sm">
                <span className="block text-stone-600 mb-1">Phone</span>
                <input name="newCustomerPhone" className={fieldClass} />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="block text-stone-600 mb-1">Portal password (optional)</span>
                <input
                  name="newCustomerPassword"
                  type="password"
                  autoComplete="new-password"
                  className={fieldClass}
                />
                <span className="block text-xs text-stone-400 mt-1">
                  Leave blank if they are not signing in online. At least 8 characters otherwise.
                </span>
              </label>
            </div>
          </div>

          <PetFields
            heading="Their pet"
            species={newPetSpecies}
            onSpeciesChange={setNewPetSpecies}
          />
        </>
      )}

      {/* Services for this pet. Duration is added up from them, so nobody
          types a number. */}
      <div>
        <span className="block text-sm font-semibold text-stone-700 mb-1.5">
          Services <span className="text-red-700">*</span>
        </span>
        <ServicePicker key={species ?? "any"} services={applicable} />
        <p className="text-xs text-stone-400 mt-1">
          {species
            ? `Showing services for ${SPECIES_LABEL[species].toLowerCase()}s and any pet.`
            : "Pick a pet to narrow this to the services that apply."}{" "}
          The estimated duration is the total of the services chosen.
        </p>
      </div>

      {/* Tell the server which shape to expect, without relying on the
          disabled state of fields that are not rendered. */}
      <input type="hidden" name="petMode" value={newPet ? "new" : "existing"} />
    </div>
  );
}
