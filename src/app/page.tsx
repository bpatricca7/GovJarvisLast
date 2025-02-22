'use client';

import { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { supabase } from '@/lib/supabase';
import type { StaffingPlan, ChatMessage } from '@/types/supabase';
import { v4 as uuidv4 } from 'uuid';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [staffingPlan, setStaffingPlan] = useState<StaffingPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [rfpText, setRfpText] = useState<string>('');

  // Load the most recent staffing plan and chat messages on component mount
  useEffect(() => {
    const loadRecentPlan = async () => {
      const { data: planData, error: planError } = await supabase
        .from('staffing_plans')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (planError) {
        console.error('Error loading recent plan:', planError);
        return;
      }

      if (planData) {
        setStaffingPlan(planData);
        setRfpText(planData.rfp_text);

        // Load associated chat messages
        const { data: chatData, error: chatError } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('staffing_plan_id', planData.id)
          .order('created_at', { ascending: true });

        if (chatError) {
          console.error('Error loading chat messages:', chatError);
          return;
        }

        if (chatData) {
          setMessages(chatData.map(msg => ({
            role: msg.role,
            content: msg.content
          })));
        }
      }
    };

    loadRecentPlan();
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      try {
        setIsLoading(true);
        const formData = new FormData();
        formData.append('file', acceptedFiles[0]);

        const response = await axios.post('/api/upload', formData);
        const extractedText = response.data.text;
        setRfpText(extractedText);

        // Generate initial staffing plan
        const planResponse = await axios.post('/api/generate-plan', {
          rfpText: extractedText,
          approach: 'bottom_up'
        });

        // Create new staffing plan in Supabase
        const planId = uuidv4();
        const { error: insertError } = await supabase
          .from('staffing_plans')
          .insert({
            id: planId,
            user_id: (await supabase.auth.getUser()).data.user?.id || 'anonymous',
            rfp_text: extractedText,
            step1_tasks: planResponse.data.step1Tasks,
            step2_tasks_with_lcats: planResponse.data.step2TasksWithLCATs,
            final_staffing_plan: planResponse.data.finalStaffingPlan
          });

        if (insertError) {
          console.error('Error saving staffing plan:', insertError);
          throw insertError;
        }

        // Update state with new plan
        setStaffingPlan({
          id: planId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user_id: (await supabase.auth.getUser()).data.user?.id || 'anonymous',
          rfp_text: extractedText,
          step1_tasks: planResponse.data.step1Tasks,
          step2_tasks_with_lcats: planResponse.data.step2TasksWithLCATs,
          final_staffing_plan: planResponse.data.finalStaffingPlan
        });

        // Clear chat messages for new plan
        setMessages([]);
      } catch (error) {
        console.error('Error processing file:', error);
        alert('Error processing file. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
  });

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !staffingPlan) return;

    const newMessage: Message = { role: 'user', content: inputMessage };
    setMessages(prev => [...prev, newMessage]);
    setInputMessage('');

    try {
      setIsLoading(true);

      // Save user message to Supabase
      await supabase
        .from('chat_messages')
        .insert({
          staffing_plan_id: staffingPlan.id,
          role: 'user',
          content: inputMessage
        });

      const response = await axios.post('/api/chat', {
        message: inputMessage,
        planData: staffingPlan,
        rfpText,
        history: messages
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.data.message
      };

      // Save assistant message to Supabase
      await supabase
        .from('chat_messages')
        .insert({
          staffing_plan_id: staffingPlan.id,
          role: 'assistant',
          content: response.data.message
        });

      setMessages(prev => [...prev, assistantMessage]);

      if (response.data.updatedPlan) {
        // Update staffing plan in Supabase
        const { error: updateError } = await supabase
          .from('staffing_plans')
          .update({
            final_staffing_plan: response.data.updatedPlan.finalStaffingPlan,
            updated_at: new Date().toISOString()
          })
          .eq('id', staffingPlan.id);

        if (updateError) {
          console.error('Error updating staffing plan:', updateError);
          throw updateError;
        }

        setStaffingPlan(prev => ({
          ...prev!,
          final_staffing_plan: response.data.updatedPlan.finalStaffingPlan,
          updated_at: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Error sending message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen">
      {/* Chat Section */}
      <div className="w-1/3 bg-white border-r border-gray-200 p-4 flex flex-col">
        <div className="flex-1 overflow-y-auto mb-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`mb-4 p-3 rounded-lg ${
                message.role === 'user'
                  ? 'bg-blue-100 ml-auto'
                  : 'bg-gray-100'
              }`}
            >
              {message.content}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            className="flex-1 p-2 border border-gray-300 rounded"
            placeholder="Type your message..."
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !staffingPlan}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
          >
            Send
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4">
        {!rfpText ? (
          <div
            {...getRootProps()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500"
          >
            <input {...getInputProps()} />
            <p>Drag and drop a PDF or Word document here, or click to select</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Staffing Plan</h2>
            {staffingPlan?.final_staffing_plan && (
              <div className="bg-white rounded-lg shadow p-4">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="px-4 py-2">Task ID</th>
                      <th className="px-4 py-2">Labor Category</th>
                      <th className="px-4 py-2">Hours</th>
                      <th className="px-4 py-2">Rationale</th>
                      <th className="px-4 py-2">Basis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffingPlan.final_staffing_plan.tasks.map((task, index) => (
                      <tr key={index} className="border-t">
                        <td className="px-4 py-2">{task.taskId}</td>
                        <td className="px-4 py-2">{task.lcat}</td>
                        <td className="px-4 py-2">{task.hours}</td>
                        <td className="px-4 py-2">{task.mathRationale}</td>
                        <td className="px-4 py-2">{task.basis}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 