"use client"

import { useState, useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter
} from "@/components/ui/dialog"
import { withdrawStreamSchema, type WithdrawStreamFormData, type StreamRecord } from "@/lib/validations"
import { StellarService } from "@/lib/stellar"

interface WithdrawStreamModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stream: StreamRecord
  onSuccess?: (txHash: string) => void
  onError?: (error: string) => void
}

export function WithdrawStreamModal({
  open,
  onOpenChange,
  stream,
  onSuccess,
  onError,
}: WithdrawStreamModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [withdrawableAmount, setWithdrawableAmount] = useState<string>("0")
  const [isLoadingAmount, setIsLoadingAmount] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm<WithdrawStreamFormData>({
    resolver: zodResolver(withdrawStreamSchema),
    defaultValues: {
      useMax: false,
      useSelf: true,
      withdrawTo: stream.recipient,
    },
  })

  const watchedValues = watch()
  const { useMax, useSelf } = watchedValues

  // Fetch withdrawable amount when modal opens
  useEffect(() => {
    if (!open || !stream.id) return

    let cancelled = false
    setIsLoadingAmount(true)

    StellarService.getWithdrawableAmount(stream.id)
      .then(amount => {
        if (cancelled) return
        setWithdrawableAmount(amount)
      })
      .catch(error => {
        if (cancelled) return
        console.error("Failed to fetch withdrawable amount:", error)
        onError?.("Failed to fetch withdrawable amount")
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAmount(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, stream.id, onError])

  // Update amount when useMax changes
  useEffect(() => {
    if (useMax && withdrawableAmount) {
      setValue("amount", withdrawableAmount)
    } else if (!useMax) {
      setValue("amount", "")
    }
  }, [useMax, withdrawableAmount, setValue])

  // Update withdraw address when useSelf changes
  useEffect(() => {
    if (useSelf) {
      setValue("withdrawTo", stream.recipient)
    } else {
      setValue("withdrawTo", "")
    }
  }, [useSelf, stream.recipient, setValue])

  const streamProgress = useMemo(() => {
    return StellarService.calculateStreamProgress(stream)
  }, [stream])

  const availableFormatted = useMemo(() => {
    return StellarService.formatTokenAmount(withdrawableAmount)
  }, [withdrawableAmount])

  const onSubmit = async (data: WithdrawStreamFormData) => {
    setIsSubmitting(true)
    try {
      const txHash = await StellarService.withdrawFromStream(stream.id, data)
      onSuccess?.(txHash)
      onOpenChange(false)
      reset()
    } catch (error) {
      console.error("Error withdrawing from stream:", error)
      onError?.(error instanceof Error ? error.message : "Failed to withdraw from stream")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false)
      reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-sm">
        <DialogHeader>
          <DialogTitle>Withdraw From Stream</DialogTitle>
          <DialogClose onClick={handleClose} />
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Stream Info */}
          <div className="space-y-2 p-3 bg-zinc-800 rounded-lg border border-zinc-700">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Total:</span>
              <span className="font-medium text-zinc-50">{StellarService.formatTokenAmount(stream.totalAmount)} {stream.tokenSymbol}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Withdrawn:</span>
              <span className="font-medium text-zinc-50">{StellarService.formatTokenAmount(stream.withdrawnAmount)} {stream.tokenSymbol}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Available:</span>
              <span className="font-medium text-green-400">
                {isLoadingAmount ? "Loading..." : `${availableFormatted} ${stream.tokenSymbol}`}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Progress:</span>
              <span className="font-medium text-zinc-50">{streamProgress.progressPercentage.toFixed(1)}%</span>
            </div>
          </div>

          {/* Amount Selection */}
          <div className="space-y-2">
            <Label>Amount ({stream.tokenSymbol})</Label>

            <div className="flex gap-2">
              <Button
                type="button"
                variant={useMax ? "default" : "outline"}
                size="sm"
                onClick={() => setValue("useMax", true)}
                disabled={isSubmitting || isLoadingAmount}
                aria-pressed={useMax}
              >
                Max
              </Button>
              <Button
                type="button"
                variant={!useMax ? "default" : "outline"}
                size="sm"
                onClick={() => setValue("useMax", false)}
                disabled={isSubmitting}
                aria-pressed={!useMax}
              >
                Custom
              </Button>
              {useMax && (
                <span className="text-sm text-zinc-400 self-center">
                  ~ {availableFormatted}
                </span>
              )}
            </div>

            {!useMax && (
              <div className="space-y-1">
                <Input
                  type="number"
                  step="0.0000001"
                  placeholder="0.00"
                  aria-label={`Withdrawal amount in ${stream.tokenSymbol}`}
                  aria-describedby={errors.amount ? "withdraw-amount-error" : undefined}
                  aria-invalid={!!errors.amount}
                  {...register("amount")}
                  disabled={isSubmitting}
                />
              </div>
            )}
            {errors.amount && (
              <p id="withdraw-amount-error" role="alert" className="text-sm text-red-400">{errors.amount.message}</p>
            )}
          </div>

          {/* Withdraw To */}
          <div className="space-y-2">
            <Label>Withdraw To</Label>

            <div className="flex gap-2">
              <Button
                type="button"
                variant={useSelf ? "default" : "outline"}
                size="sm"
                onClick={() => setValue("useSelf", true)}
                disabled={isSubmitting}
                aria-pressed={useSelf}
              >
                Self
              </Button>
              <Button
                type="button"
                variant={!useSelf ? "default" : "outline"}
                size="sm"
                onClick={() => setValue("useSelf", false)}
                disabled={isSubmitting}
                aria-pressed={!useSelf}
              >
                Other Address
              </Button>
            </div>

            {!useSelf && (
              <div className="space-y-1">
                <Input
                  placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                  aria-label="Withdrawal destination address"
                  aria-describedby={errors.withdrawTo ? "withdraw-to-error" : undefined}
                  aria-invalid={!!errors.withdrawTo}
                  {...register("withdrawTo")}
                  disabled={isSubmitting}
                />
                {errors.withdrawTo && (
                  <p id="withdraw-to-error" role="alert" className="text-sm text-red-400">{errors.withdrawTo.message}</p>
                )}
              </div>
            )}

            {useSelf && (
              <p className="text-xs text-zinc-400 break-all font-mono">
                {stream.recipient}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isLoadingAmount}
            >
              {isSubmitting ? "Withdrawing..." : "Withdraw"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}