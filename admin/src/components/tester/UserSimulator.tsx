import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Smartphone,
  Phone,
  Send,
  CheckCircle,
  Loader2,
  KeyRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserSimulatorProps {
  onSendOtp: (config: OtpConfig) => Promise<void>;
  onVerify: (code: string) => Promise<void>;
  activeRequest: {
    requestId: string;
    otpCode: string;
    status: string;
    expiresAt: string;
  } | null;
  loading: boolean;
  verifyResult: { success: boolean; message: string } | null;
  error: string;
}

interface OtpConfig {
  phoneNumber: string;
  callerId: string;
  voiceSpeed: string;
  repeatCount: string;
  language: string;
}

export function UserSimulator({
  onSendOtp,
  onVerify,
  activeRequest,
  loading,
  verifyResult,
  error,
}: UserSimulatorProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [voiceSpeed, setVoiceSpeed] = useState('1.0');
  const [repeatCount, setRepeatCount] = useState('2');
  const [language, setLanguage] = useState('en');
  const [verifyCode, setVerifyCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyCode('');
    await onSendOtp({ phoneNumber, callerId: '', voiceSpeed, repeatCount, language });
  };

  const handleVerify = async () => {
    await onVerify(verifyCode);
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-5 w-5 text-primary" />
          User Simulation
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <form onSubmit={handleSubmit} className="space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Phone Input */}
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="phone"
                type="tel"
                placeholder="+1 555 123 4567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="pl-10 font-mono"
                disabled={loading}
                required
              />
            </div>
          </div>

          {/* Advanced Options */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Speed</Label>
              <Select value={voiceSpeed} onValueChange={setVoiceSpeed} disabled={loading}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.8">Slow</SelectItem>
                  <SelectItem value="1.0">Normal</SelectItem>
                  <SelectItem value="1.2">Fast</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Repeat</Label>
              <Select value={repeatCount} onValueChange={setRepeatCount} disabled={loading}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1x</SelectItem>
                  <SelectItem value="2">2x</SelectItem>
                  <SelectItem value="3">3x</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Language</Label>
              <Select value={language} onValueChange={setLanguage} disabled={loading}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">EN</SelectItem>
                  <SelectItem value="es">ES</SelectItem>
                  <SelectItem value="fr">FR</SelectItem>
                  <SelectItem value="de">DE</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Send Button */}
          <Button type="submit" className="w-full" disabled={loading || !phoneNumber}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send OTP
              </>
            )}
          </Button>

          {/* Active Request Info */}
          {activeRequest && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">OTP Code</span>
                  <Badge variant="outline" className="font-mono text-lg tracking-wider">
                    {activeRequest.otpCode}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Expires</span>
                  <span className="text-sm font-mono">
                    {new Date(activeRequest.expiresAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              <Separator />

              {/* Verify Section */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  Verify Code
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    maxLength={6}
                    className="font-mono text-center text-lg tracking-widest"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleVerify}
                    disabled={verifyCode.length < 4}
                  >
                    <CheckCircle className="h-4 w-4" />
                  </Button>
                </div>
                {verifyResult && (
                  <div
                    className={cn(
                      'p-2 rounded-md text-sm text-center',
                      verifyResult.success
                        ? 'bg-success/10 text-success'
                        : 'bg-destructive/10 text-destructive'
                    )}
                  >
                    {verifyResult.message}
                  </div>
                )}
              </div>
            </>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
