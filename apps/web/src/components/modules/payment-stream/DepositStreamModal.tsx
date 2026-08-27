"use client"

import { useState, useMemo } from "react"
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
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog"
import { depositStreamSchema, type DepositStreamFormData, type StreamRecord } from "@/lib/validations"
import { StellarService } from "@/lib/stellar"
import { depositToStream } from "@/lib/api"
import { notify } from "@/utils/notification"
import { useWallet } from "@/providers/StellarWalletProvider"

interface DepositStreamModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stream: StreamRecord
  onSuccess?: (txHash: string) => void
  onError?: (error: string) => void
}

export function DepositStreamModal({
  open,
  onOpenChange,
  stream,
  onSuccess,
  onError,
}: DepositStreamModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { signTransaction, address, isConnected } = useWallet()

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<DepositStreamFormData>({
    resolver: zodResolver(depositStreamSchema),
    defaultValues: {
      amount: "",
    },
  })

  const streamProgress = useMemo(() => {
    return StellarService.calculateStreamProgress(stream)
  }, [stream])

  const onSubmit = async (data: DepositStreamFormData) => {
    const parsedAmount = parseFloat(data.amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      notify.error("Deposit amount must be greater than zero")
      return
    }

    setIsSubmitting(true)
    try {
      const amount = BigInt(Math.floor(parseFloat(data.amount) * 10000000))

      // Use the real SDK-backed depositToStream from @/lib/api
      // This routes through PaymentStreamClient.deposit()
      if (!isConnected || !signTransaction || !address) {
        notify.error('Wallet not connected');
        return;
      }

      const hash = await depositToStream({
        streamId: stream.contractStreamId,
        amount,
        sender: address,
        signTransaction,
      });

      notify.success("Deposit successful!")
      onSuccess?.(hash)
      onOpenChange(false)
      reset()
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to deposit to stream")
      onError?.(error instanceof Error ? error.message : "Failed to deposit to stream")
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
      <DialogContent className="w-full max-w-sm" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Add Funds to Stream</DialogTitle>
          <DialogDescription>
            Top up this payment stream with additional funds.
          </DialogDescription>
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
              <span className="text-zinc-400">Progress:</span>
              <span className="font-medium text-zinc-50">{streamProgress.progressPercentage.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Time Remaining:</span>
              <span className="font-medium text-zinc-50">{streamProgress.timeRemaining}</span>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="deposit-amount">Deposit Amount ({stream.tokenSymbol})</Label>
            <div className="space-y-1">
              <Input
                id="deposit-amount"
                type="number"
                min="0"
                step="0.0000001"
                placeholder="0.00"
                aria-label={`Deposit amount in ${stream.tokenSymbol}`}
                aria-describedby={errors.amount ? "deposit-amount-error" : undefined}
                aria-invalid={!!errors.amount}
                {...register("amount")}
                disabled={isSubmitting}
              />
            </div>
            {errors.amount && (
              <p id="deposit-amount-error" role="alert" className="text-sm text-red-400">
                {errors.amount.message}
              </p>
            )}
            <p className="text-xs text-zinc-400">
              This will extend or increase the stream funding
            </p>
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
              disabled={isSubmitting}
            >
              {isSubmitting ? "Processing..." : "Add Funds"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
